// ---Goal: ---
// Visualization of energy use, electricity generation, and CO2 emission data, pulled directly from the EIA for the latest years, split by state or available
// for whole US, and heavily interactive. Intended to show changes needed to make all used energy green, as well as showing impact of increased demand on
// electricity load & on CO2 emissions.

// ---Assumptions: ---
// Location of link to query will remain the same
// Acronyms will remain the same
// Years that have electric & total for energy will also have the primary pieces
// Response length won't exceed allowed amount, else years will truncate
// The subsets that currently exist in each values map are those that will continue to be available, and will continue to mean the same pools of data
// (else add other subsets, their IDs, and storage/display handling)
// Electricity returns won't have duplicate values or items to subtract for some year & ID (else we'll have to do slightly more complex storage - map of id to val -
// like in energy; than just adding as we go)
// Units will remain the same (the pulling code will throw an error if they are changed; pre-storage handling will need to be adjusted in this case)
// Only nuclear & hydroelectric energies are controversial as being green or not green (else add more checkboxes & handling)
// The values are pulled accurately (this is difficult to check, as for most, a check by an automatic method would involve merely pulling them again in the same
// way, defeating the purpose; this can be checked manually through the linked EIA browsers)
// Petroleum fully includes the aviation/marine pieces (for advanced), and they do not overlap

// ---These should be changed to someone else's EIA API key & directory root (for local files) once I'm not involved with the project: ---
// (key obtainable on EIA site):
let eiaKey = "QL5ASXTSN9ccXzVu4Ly6UKwc0Fkj4AyKuDVs1dEX";
let directoryRoot = ""; // if this is blank, doesn't seem to trigger CORS due to same origin: 
// if using full root name, may need to update server CORS policy to allow

// -----------------------------------------------------
// ---Helper Objects: ---
// -----------------------------------------------------

// Own mapping keys are stored inside so that objects are independently functional

// These add together to the primary total for their sector, used to give more detail into its energy use
class PrimaryPiece { 
    key; // ex. "wind"
    idToVal; // map to contain ID to baseVal to add or subtract for state mappings for this piece, GWh
    // needs to be a map due to some pieces having multiple different things that need to be added or subtracted
    
    baseVal; // totaled val state of this piece, GWh

    adjustedVal; // GWh

    // add means add together, sub means subtract from these, all to get final base total for primary
    // b/c some vals come with caveats (ex. natural gas needs supplemental fuels subtracted)
    constructor(key, idsEnergyAdd, idsEnergySub) {
      this.idToVal = new Map();
  
      this.key = key;
      for(let id of idsEnergyAdd) {
        this.idToVal.set(id, {baseVal: null, add: true});
      }
      for(let id of idsEnergySub) {
        this.idToVal.set(id, {baseVal: null, add: false});
      }

      this.baseVal = null;
      this.adjustedVal = null;
    }
}

// To aid in EnergySubset mapping mechanics, holds one of the pieces that a sector subset is divided into (its name, ids, and values for current-set state
// for current-set year)
// IDs may pull in different units than stored; are converted in pull method if so
// A sector subset is divided into 3 main pieces: elecSector, primary, and total, where elecSector + primary = total,
// electric = electricity this sector consumes from the electric sector (post-production losses, not inc them - ex. coal's inefficiency disregarded)
// primary = total primary energy this sector consumes (not from elecSector)
// total = this sector's total consumption (for the set year, not inc. "electrical system energy losses") = electric + primary
// primary energy SubSubsets are further divided using inner map
// null or 0 for any value means is 0 or is not present in EIA data (assumed 0)
class SubSubset {
    key; // ex. "elecSector"
    idEnergy; // ex. "ESCCB" for a commercial sector subset, electric sub subset

    baseVal; // GWh

    adjustedVal; // GWh

    primaryPieces; // only non-null in primary SubSubsets, contains breakdown of primary energy by map of id to energy from that id, values in GWh
    // and another ID & value per primary piece that stores CO2 for that primary piece + how to access it
    // (technically we could split electric data too, for both energy & CO2, but the focus here is more on the primary parts)

    constructor(key, idEnergy) {
        this.key = key;
        this.idEnergy = idEnergy;
        this.baseVal = null;
        this.adjustedVal = null;
        this.primaryPieces = null;
    }

    setupPrimaryPieces(idWind, idSolar, idGeo, idHydro, idCoal, idNatGas, idSuppGas, idPetroleum) { // all nuclear goes to elec. power sector, so not here
        this.primaryPieces = new Map();
    
        // adding pieces in the right order to maintain correct behavior elsewhere
        this.primaryPieces.set("wind", new PrimaryPiece("wind", [idWind], [])); 
        this.primaryPieces.set("solar", new PrimaryPiece("solar", [idSolar], []));
        this.primaryPieces.set("geothermal", new PrimaryPiece("geothermal", [idGeo], []));
        this.primaryPieces.set("hydroelectric", new PrimaryPiece("hydroelectric", [idHydro], []));
    
        this.primaryPieces.set("coal", new PrimaryPiece("coal", [idCoal], []));
        this.primaryPieces.set("natural gas", new PrimaryPiece("natural gas", [idNatGas], [idSuppGas])); // subtracting supplemental as per glossary for primary
        this.primaryPieces.set("petroleum", new PrimaryPiece("petroleum", [idPetroleum], []));
    
        this.primaryPieces.set("other", new PrimaryPiece("other", [], [])); // derived from primary total
      }
}

// To store subsets of energy consumption data per sector type in separate objects
class EnergySubset {
    key; // the sector type (ex. "commercial")

    // Base demand can be found in the "total" subSubset baseVal; 
    // Base electrification can be calculated by "electric" divided by "total" baseVal

    baseElecEfficiency; // for this sector, proportion of electricity needed to primary energy to accomplish same tasks (due to certain heat/power savings)
    adjustedElecEfficiency;

    // The values the user has moved to on the sliders for this sector
    adjustedDemand; // % of base demand (since GWh will vary by electrification due to efficiency factors)
    adjustedElectrification; // % of adjustedDemand electrified (efficiency factor not taken into account - just raw electric/total energy)

    // Map of sub subset names to SubSubsets
    subSubsets; 

    constructor(key, elecEfficiency, idElectric, idTotal, 
        idWind, idSolar, idGeo, idHydro,
        idCoal, idNatGas, idSuppGas, idPetroleum) {

        this.key = key;
        this.baseElecEfficiency = elecEfficiency;
        this.adjustedElecEfficiency = this.baseElecEfficiency;

        this.adjustedDemand = null;
        this.adjustedElectrification = null;

        this.subSubsets = new Map();
        this.subSubsets.set("electric", new SubSubset("electric", idElectric)); // id for electric stored higher up due to need to divide
        this.subSubsets.set("primary", new SubSubset("primary", null));
        this.subSubsets.set("total", new SubSubset("total", idTotal)); 
    
        this.subSubsets.get("primary").setupPrimaryPieces(idWind, idSolar, idGeo, idHydro,
                                                            idCoal, idNatGas, idSuppGas, idPetroleum);
    }
}

// To store pieces of our electricity generation or import data in separate objects
// null or 0 for any generation means is 0 or is not present in EIA data (assumed 0)
class ElectricityPiece {
  key; // ex. "wind"
  ids; // array of IDs to sum up vals of for this piece

  baseVal; // totaled val state of this piece, GWh

  adjustedVal; // GWh
  
  adjustedDemand; // % of generation & import total base val

  constructor(key, ids) {
    this.key = key;
    
    this.ids = ids;
    this.baseVal = null;
    this.adjustedVal = null;
    this.adjustedDemand = 100;
  }
}

// To store pieces of the CO2 data in separate objects, holds one of the pieces a CO2Subset is divided into
// Its corresponding ID will be found outside in the object that holds the overall CO2 map, as CO2Piece ids are the same for ones with the same keys
// regardless of parent, and must be used alongside the parent ID to acquire the correct piece
// null or 0 for any generation means is 0 or is not present in EIA data (assumed 0)
class CO2Piece {
  key; // ex. "coal"

  factor; // what to multiply the GWh of energy/electricity use for the corresponding piece by to achieve its CO2 output, calculated after pull

  baseVal; // million metric tons

  adjustedVal; // is adjusted as user adjusts the piece that causes it; million metric tons

  constructor(key) {
    this.key = key;

    this.factor = null;
    this.baseVal = null;
    this.adjustedVal = null;
  }
}

// To store pieces of the CO2 data in separate objects
// Contains map to further pieces that hold the values (initial & adjusted based on user's adjustments of energy/electricity sources)
class CO2Subset {
  key; // ex. "residential"
  id; // id for this CO2 sector

  // Map of piece names to CO2Pieces
  co2Pieces;

  constructor(key, id) {
    this.key = key;
    this.id = id;

    this.co2Pieces = new Map();
    this.co2Pieces.set("coal", new CO2Piece("coal"));
    this.co2Pieces.set("natural gas", new CO2Piece("natural gas"));
    this.co2Pieces.set("petroleum", new CO2Piece("petroleum"));
  }
}

// -----------------------------------------------------
// ---Inner Variables: ---
// -----------------------------------------------------
// Selected state or entire US, default to US (used to initialize some US-wide data at start) and changed by user with dropdown menu 
let state = "US";

// Year of data 
// Initialized to latest year, changed by user with dropdown 
let year = null;

// State name to ID mapping (for HTML dropdown & for state capacity generation)
let stateNameToID = new Map();

// (subset key -> FuelSubset object)
// IDs pull energy in Billion BTU, need conversion 
let consumption = new Map();

// using end-use, not net, for total (net was too small, primary parts overflowed); so we can't pull primary (similar process subtractions in it as in net), 
// we must subtract electric to get it
consumption.set("residential", new EnergySubset("residential", 0.2, "ESRCB", "TNRCB",
                                                  null, "SORCB", "GERCB", null,
                                                  "CLRCB", "NGRCB", "SFRCB", "PARCB")); 
consumption.set("commercial", new EnergySubset("commercial", 0.2, "ESCCB", "TNCCB",
                                                "WYCCB", "SOCCB", "GECCB", "HYCCB",
                                                "CLCCB", "NGCCB", "SFCCB", "PACCB"));
// the ID is slightly different for industrial electricity than the others: it's "excluding refinery use" - hence "ESISB", not "ESICB" (the latter doesn't add up)
consumption.set("industrial", new EnergySubset("industrial", 0.82, "ESISB", "TNICB",
                                                "WYICB", "SOICB", "GEICB", "HYICB",
                                                "CLICB", "NGICB", "SFINB", "PAICB")); 
// NGASB not NGACB for transportation's natural gas (there's no supplemental fuels to subtract out by ID here)
consumption.set("transportation", new EnergySubset("transportation", 0.2, "ESACB", "TNACB",
                                                    null, null, null, null,
                                                    "CLACB", "NGASB", null, "PAACB")); 

// For advanced selection of user's exclusion of marine or aviation from transportation electrification primary pieces
// These hold only the ids & pre-loaded base val: adjusted val will have to get calculated as they're moved in/out of use
// NOTE: if these change to include ids to subtract, the method by which they are added to/subtracted from consumption on 
// checkbox check will have to be modified slightly
let exclude = new Map();

exclude.set("marine", new PrimaryPiece("marine", ["RFACB"], []));
exclude.set("aviation", new PrimaryPiece("aviation", ["AVACB", "JFACB"], []));

// (piece key -> ElectricityPiece object)
let electricity = new Map();

electricity.set("wind", new ElectricityPiece("wind", ["WND"]));
electricity.set("solar", new ElectricityPiece("solar", ["SUN"])); // PV & thermal
electricity.set("geothermal", new ElectricityPiece("geothermal", ["GEO"]));
electricity.set("hydroelectric", new ElectricityPiece("hydroelectric", ["HYC", "HPS"])); // Conventional and pumped storage
electricity.set("nuclear", new ElectricityPiece("nuclear", ["NUC"]));

electricity.set("coal", new ElectricityPiece("coal", ["COW"]));
electricity.set("natural gas", new ElectricityPiece("natural gas", ["NG"]));
electricity.set("petroleum", new ElectricityPiece("petroleum", ["PEL", "PC"]));

// Separate, because it can be negative, and is not contained in the CO2 section
let elecOther = new ElectricityPiece("other", ["OOG", "OTH", "BIO"]);
// (can't split out biomass since it's available here but not in the energy demand section)

// Separate, because it is pulled from a different section of the EIA site, can be negative, and is not contained in the CO2 section
let elecImport = new ElectricityPiece("import", ["ELNIP", "ELISP"]);

// sum of electricity map base vals + other + import: total base electricity for selected state (used for easy slider manipulation)
let elecBaseGeneration = null;

// Transmission efficiency (how much of electricity generated is able to be used after losses)
let transmissionEfficiency = null;

// Store CO2 IDs that are repeatedly used outside for less redundancy + overall ids and values map
// (subset key -> CO2Subset object)
let co2 = {ids: new Map(), map: new Map()};

co2.ids.set("CO", "coal");
co2.ids.set("NG", "natural gas");
co2.ids.set("PE", "petroleum");

co2.map.set("industrial", new CO2Subset("industrial", "IC"));
co2.map.set("transportation", new CO2Subset("transportation", "TC"));
co2.map.set("commercial", new CO2Subset("commercial", "CC"));
co2.map.set("residential", new CO2Subset("residential", "RC"));
co2.map.set("electric", new CO2Subset("electric", "EC"));

// Set of primary pieces considered green
let greenSet = new Set(["wind", "solar", "geothermal", "hydroelectric", "nuclear"]);

// When a number is below this value, it's considered 0
let roundToZero = 0.000001;

// -----------------------------------------------------
// ---Display Variables: ---
// -----------------------------------------------------

// To add commas to delimit 000 in numbers and keep the 2 decimal points
let formatCommas = d3.format(",.2f");

// Whether to display energy data in GW or GWh (one is more intuitive to renewable energy formats, the other to
// consumable energy formats; adjusted with user's selection)
let GWhorGW = "GWh";
let GWhorGWDivisor = 1; // when above is GW, this is set to 365*24

// Color map
// Each piece will correspond to the same hue of color across sectors, but will be lighter shade if declared green by user than if not
let colorMap = new Map();

colorMap.set("electric", {"green": "#f7dcf1", "ngreen": null});

colorMap.set("wind", {"green": "#ebdcf7", "ngreen": null});
colorMap.set("solar", {"green": "#dcdff7", "ngreen": null});
colorMap.set("geothermal", {"green": "#dcebf7", "ngreen": null});
colorMap.set("hydroelectric", {"green": "#dcf6f7", "ngreen": "#1b3030"});
colorMap.set("nuclear", {"green": "#e9f7dc", "ngreen": "#374d22"});

colorMap.set("coal", {"green": null, "ngreen": "#595c1c"});
colorMap.set("natural gas", {"green": null, "ngreen": "#634a10"});
colorMap.set("petroleum", {"green": null, "ngreen": "#522209"});

colorMap.set("other", {"green": null, "ngreen": "#36120d"});

colorMap.set("import", {"green": null, "ngreen": "#2c0d36"});

colorMap.set("marine", {"green": null, "ngreen": "#000000"});
colorMap.set("aviation", {"green": null, "ngreen": "#000000"});

// To round large numbers up to 1 significant figure (used to standardize a clean universal upper bound for sector grid visualizations)
function roundUpOneSigFig(number) {
  let currReturn = parseFloat(number.toPrecision(1));
  let currDigits = currReturn.toString().length;
  if(currReturn < number) {
    return currReturn + (1 * (10 ** (currDigits - 1)));
  } else {
    return currReturn;
  }
}

// To store global bound on the 4 sectors' bar graphs' grid pieces, to know when to redraw all
let currEnergyBound = 0;

// -----------------------------------------------------
// ---HTML Element Adjustments: ---
// -----------------------------------------------------
// Elements start out locked & are unlocked after initialization (relocked with each data fetch)

d3.select("#state-select-drop")
  .on("change", updateState);

d3.select("#year-select-drop")
  .on("change", updateYear);

d3.select("#GWh-or-GW-drop")
  .on("change", updateGWhorGW);

d3.select("#green-select").selectAll("input")
  .on("change", (event) => updateGreenSet(event));

d3.select("#exclude-transportation-select").selectAll("input")
  .on("change", (event) => updateExcludeTransportationSet(event));

d3.select("#show-efficiencies").select("input")
  .on("change", (event) => updateShowEfficiencies(event));

d3.selectAll(".cell > .input-container.type-demand,.input-container.type-electrification > .slider")
  .on("change", (event) => updateSectorSlider(event));

d3.selectAll(".cell > .type-elec-efficiency > .slider")
  .on("change", (event) => updateElecEfficiency(event));

d3.select(".electricity > .input-container.type-equalize-demand > .button")
  .on("click", updateEqualizeDemand);

d3.selectAll(".electricity .input-container:not(.type-transmission-efficiency):not(.type-equalize-demand) > .slider")
  .on("change", (event) => updateElectricity(event));

d3.select(".electricity .input-container.type-transmission-efficiency > .slider")
  .on("change", (event) => updateTransEff(event));

// -----------------------------------------------------
// ---On-Change Functions: ---
// -----------------------------------------------------

// Called on user change of state selection, changes state variable then 
// locks user input, updates inner data & its text & vis output, unlocks user input
async function updateState() {
  state = d3.select("#state-select-drop").property("value");

  disableUserInput();

  await pullStoreData();

  checkTotalParts();

  visualizeEnergyData();
  visualizeElectricityData();
  visualizeCO2Data();
  visualizeLegend();

  enableUserInput();
}

// Called on user change of year selection, changes year variable then
// locks user input, updates inner data & its text & vis output, unlocks user input
async function updateYear() {
  year = parseInt(d3.select("#year-select-drop").property("value"));

  disableUserInput();

  await pullStoreData();

  checkTotalParts();

  visualizeEnergyData();
  visualizeElectricityData();
  visualizeCO2Data();
  visualizeLegend();

  enableUserInput();
}

// Called on user change of GW vs GWh display selection, changes GWhorGW and updates text output
function updateGWhorGW() {
  GWhorGW = d3.select("#GWh-or-GW-drop").property("value");
  if(GWhorGW === "GWh") {
    GWhorGWDivisor = 1;
  } else {
    GWhorGWDivisor = 365*24;
  }

  visualizeEnergyData();
  visualizeElectricityData();
  visualizeCO2Data();
  visualizeLegend();
}

// Called on user change of what pieces count as green
function updateGreenSet(event) {
  let currPiece = d3.select(event.target).property("value");
  if(d3.select(event.target).property("checked")) {
    greenSet.add(currPiece);
  } else {
    greenSet.delete(currPiece);
  }

  preventGreenElectrification();

  checkTotalParts();

  visualizeEnergyData();
  visualizeElectricityData();
  visualizeCO2Data();
  visualizeLegend();
}

// Called on user change of what pieces to exclude from transportation's electrification
function updateExcludeTransportationSet(event) {
  let currPiece = d3.select(event.target).property("value");
  let currPrimaryPieces = consumption.get("transportation").subSubsets.get("primary").primaryPieces;

  if(d3.select(event.target).property("checked")) { // split away from petroleum

    // copy stored base vals of exclude piece into transportation's primary pieces map + adjust its petroleum to not double count
    currPrimaryPieces.set(currPiece, new PrimaryPiece(currPiece, exclude.get(currPiece)["idToVal"].keys(), []));
    currPrimaryPieces.get(currPiece)["baseVal"] = exclude.get(currPiece)["baseVal"];

    for(let currID of exclude.get(currPiece)["idToVal"].keys()) {
      currPrimaryPieces.get("petroleum")["idToVal"].set(currID, {baseVal: exclude.get(currPiece)["baseVal"], add: false});
    }

    currPrimaryPieces.get("petroleum")["baseVal"] -= exclude.get(currPiece)["baseVal"];

    let transportationCO2Pieces = co2.map.get("transportation").co2Pieces;
    transportationCO2Pieces.set(currPiece, new CO2Piece(currPiece));
    transportationCO2Pieces.get(currPiece)["factor"] = transportationCO2Pieces.get("petroleum")["factor"];
    transportationCO2Pieces.get(currPiece)["baseVal"] = transportationCO2Pieces.get(currPiece)["factor"] * exclude.get(currPiece)["baseVal"];
    transportationCO2Pieces.get("petroleum")["baseVal"] = transportationCO2Pieces.get("petroleum")["factor"] * currPrimaryPieces.get("petroleum")["baseVal"];
    // adjusted CO2 will get recalculated below

  } else { // consolidate back into petroleum
    currPrimaryPieces.delete(currPiece);
    for(let currID of exclude.get(currPiece)["idToVal"].keys()) {
      currPrimaryPieces.get("petroleum")["idToVal"].delete(currID);
    }

    currPrimaryPieces.get("petroleum")["baseVal"] += exclude.get(currPiece)["baseVal"];

    let transportationCO2Pieces = co2.map.get("transportation").co2Pieces;
    transportationCO2Pieces.delete(currPiece);
    transportationCO2Pieces.get("petroleum")["baseVal"] = transportationCO2Pieces.get("petroleum")["factor"] * currPrimaryPieces.get("petroleum")["baseVal"];
  }

  // Propagate adjusted vals
  preventGreenElectrification("transportation"); // in case one got moved to unelectrifiable
  calculateStoreAdjustedVals("transportation");
  calculateStoreAdjustedCO2("transportation"); // in case of electrification change in prevent green electrification

  checkTotalParts();

  visualizeEnergyData("transportation");
  visualizeCO2Data();
  visualizeLegend();
}

// Called on user clicking efficiency sliders' checkbox
function updateShowEfficiencies(event) {
  // Show or don't show the slider: values are already loaded in
  if(d3.select(event.target).property("checked")) {
    d3.selectAll(".type-elec-efficiency").style("display", "block");
    d3.selectAll(".type-transmission-efficiency").style("display", "block");
  } else {
    d3.selectAll(".type-elec-efficiency").style("display", "none");
    d3.selectAll(".type-transmission-efficiency").style("display", "none");
  }
}

// Called on user sliding a demand or electrification % slider within a sector box, changes & reprints corresponding internal data
function updateSectorSlider(event) {
    // Get updated value
    let currValue = parseFloat(d3.select(event.target).property("value"));

    // Narrow down where event occurred
    let currSliderBox = d3.select(event.target.parentNode);
    let currSectorBox = d3.select(event.target.parentNode.parentNode);

    let currSector = currSectorBox.attr("class").split(" ")
        .find((element) => /sector-/.test(element)).slice(7); // locate the class pertaining to the sector name & isolate it
    let currType = currSliderBox.attr("class").split(" ")
        .find((element) => /type-/.test(element)).slice(5); // same for demand vs electrification

    // Store data + adjust electrification if needed (currValue may be inaccurate after preventGreenElectrification)
    let currSubset = consumption.get(currSector);

    if(currType === "electrification") {
      currSubset["adjustedElectrification"] = currValue;
      preventGreenElectrification(currSector);
    } else if(currType === "demand") {
      currSubset["adjustedDemand"] = currValue;
    } else {
      throw new Error("Type is not demand or electrification: " + currType);
    }

    // Propagate event consequences from now stored adjustedDemand or adjustedElectrification through all subSubsets/pieces' adjustedVals
    calculateStoreAdjustedVals(currSector);
    calculateStoreAdjustedCO2(currSector);

    checkTotalParts();

    // Print/visualize event update based on the now stored data
    visualizeEnergyData(currSector);
    visualizeElectricityData();
    visualizeCO2Data();
    visualizeLegend();
}

// Called on user changing the electricity efficiency factor for some sector
function updateElecEfficiency(event) {
    // Get updated value
    let currValue = parseFloat(d3.select(event.target).property("value"));

    // Narrow down where event occurred
    let currSectorBox = d3.select(event.target.parentNode.parentNode);

    let currSector = currSectorBox.attr("class").split(" ")
        .find((element) => /sector-/.test(element)).slice(7); // locate the class pertaining to the sector name & isolate it

    let currSubset = consumption.get(currSector);

    // Store new  & update electrification if needed
    currSubset["adjustedElecEfficiency"] = currValue;
    preventGreenElectrification(currSector);

    // Update data to reflect it (propagate effects)
    calculateStoreAdjustedVals(currSector);
    calculateStoreAdjustedCO2(currSector);

    checkTotalParts();

    // Visualize event update
    visualizeEnergyData(currSector);
    visualizeElectricityData();
    visualizeCO2Data();
    visualizeLegend();
}

// Called on user clicking the equalize demand button, brings electricity generation up or down proportionally to its current state
// to match generation to demand (in case of some slider reaching its max or min, re-proportions)
function updateEqualizeDemand() {
  // Calculate difference between available and needed electricity (taking into account the transmission efficiency) and also the current generation
  // of all adjustable pieces
  let currElecDifference = 0;
  let currElecResponsibleTotal = 0;
  for(let currSubset of consumption.values()) {
    currElecDifference += currSubset.subSubsets.get("electric")["adjustedVal"] / transmissionEfficiency;
  }
  for(let currElectricityPiece of electricity.values()) {
    currElecDifference -= currElectricityPiece["adjustedVal"];
    currElecResponsibleTotal += currElectricityPiece["adjustedVal"];
  }
  currElecDifference -= elecOther["baseVal"];
  currElecDifference -= elecImport["baseVal"];

  if(currElecDifference < 0) { // more electricity than is consumed
    // Decrease all sliders
    // Some may hit 0 and need another loop, or several if cascade effect, to redistribute the pieces they're responsible for
    while (!(-currElecDifference <= roundToZero) && currElecResponsibleTotal !== 0) {
      let successfullyDistributed = 0;
      for(let currElectricityPiece of electricity.values()) {
        let currResponsibility = currElecDifference * (currElectricityPiece["adjustedVal"]/currElecResponsibleTotal); // current proportion of responsibility

        if(currElectricityPiece["adjustedVal"] + currResponsibility <= roundToZero) {
          successfullyDistributed -= currElectricityPiece["adjustedVal"];
          currElectricityPiece["adjustedVal"] = 0;
          currElectricityPiece["adjustedDemand"] = 0;
        } else {
          successfullyDistributed += currResponsibility;
          currElectricityPiece["adjustedVal"] += currResponsibility;
          currElectricityPiece["adjustedDemand"] = 100 * (currElectricityPiece["adjustedVal"] / elecBaseGeneration);
        }
      }

      currElecResponsibleTotal = 0;
      // recalculate total only of those that are still "in the running" for proportionality, not tapped out
      for(let currElectricityPiece of electricity.values()) {
        if(currElectricityPiece["adjustedVal"] !== 0) { // real 0 since rounded above
          currElecResponsibleTotal += currElectricityPiece["adjustedVal"];
        }
      }
      currElecDifference -= successfullyDistributed;
    }
  } else if(currElecDifference > 0) {
    // Increase all sliders
    while (!(currElecDifference <= roundToZero) && currElecResponsibleTotal !== 0) {
      let successfullyDistributed = 0;
      let maxSliderPercent = d3.select(".electricity .input-container:not(.type-transmission-efficiency) .slider").attr("max");

      for(let currElectricityPiece of electricity.values()) {
        let currResponsibility = currElecDifference * (currElectricityPiece["adjustedVal"]/currElecResponsibleTotal); 

        if(100 * ((currElectricityPiece["adjustedVal"] + currResponsibility) / elecBaseGeneration) >= maxSliderPercent) {
          successfullyDistributed += elecBaseGeneration * (maxSliderPercent / 100) - currElectricityPiece["adjustedVal"];
          currElectricityPiece["adjustedVal"] = elecBaseGeneration * (maxSliderPercent / 100);
          currElectricityPiece["adjustedDemand"] = maxSliderPercent;
        } else {
          successfullyDistributed += currResponsibility;
          currElectricityPiece["adjustedVal"] = currElectricityPiece["adjustedVal"] += currResponsibility;
          currElectricityPiece["adjustedDemand"] = 100 * (currElectricityPiece["adjustedVal"] / elecBaseGeneration);
        }
      }

      currElecResponsibleTotal = 0;
      // recalculate total only of those that are still "in the running" for proportionality, not tapped out
      for(let currElectricityPiece of electricity.values()) {
        if(currElectricityPiece["adjustedDemand"] !== maxSliderPercent) { // real 0 since rounded above
          currElecResponsibleTotal += currElectricityPiece["adjustedVal"];
        }
      }
      currElecDifference -= successfullyDistributed;
    }
  }

  calculateStoreAdjustedCO2("electric");

  checkTotalParts();

  visualizeElectricityData();
  visualizeCO2Data();
  visualizeLegend();
}

// Called on user changing some piece of electricity generation percent of total base val
function updateElectricity(event) {
    // Get updated value
    let currValue = parseFloat(d3.select(event.target).property("value"));

    // Narrow down where event occurred
    let currPieceBox = d3.select(event.target.parentNode);

    let currElectricityType = currPieceBox.attr("class").split(" ")
        .find((element) => /type-piece-/.test(element)).slice(11); // locate the class pertaining to the piece name & isolate it

    // Store new value
    let currJSKey = currElectricityType.replace(/-+/, ' ')

    let currElectricityPiece = electricity.get(currJSKey);
    currElectricityPiece["adjustedDemand"] = currValue;
    currElectricityPiece["adjustedVal"] = elecBaseGeneration * currValue / 100;

    // Propagate effects
    calculateStoreAdjustedCO2("electric");

    checkTotalParts();

    // Visualize event update
    visualizeElectricityData();
    visualizeCO2Data();
    visualizeLegend();
}

// Called on user changing electricity transmission efficiency
function updateTransEff(event) {
    // Get updated value
    let currValue = parseFloat(d3.select(event.target).property("value"));

    // Store new value
    transmissionEfficiency = currValue;

    // Visualize event update
    visualizeElectricityData();
}

// -----------------------------------------------------
// ---Main Functions: ---
// -----------------------------------------------------

// Sets up year dropdown + variables & text through initial data pull & unlocks the user input
// NOTE: assumes user input is locked in the process
async function initialize() {
    // Pull everything to initialize
    initializeStateNameToID();
    initializeStateSelect();

    await initializeYears();

    await pullStoreData();

    checkTotalParts();

    visualizeEnergyData();
    visualizeElectricityData();
    visualizeCO2Data();
    visualizeLegend();

    enableUserInput();
}

// Generate user input dropdown for state selection based on our state name -> state ID mapping
// NOTE: assumes user input is locked in the process; and does not unlock it (needs an outer layer function to do so)
function initializeStateSelect() {
    let stateSelectDrop = d3.select("#state-select-drop");
    
    let stateNames = [];
    stateNames.push("Entire US");
    let stateNamesIterator = stateNameToID.keys();
    for(let currStateNameI = stateNamesIterator.next(); !currStateNameI.done; currStateNameI = stateNamesIterator.next()) {
      let currStateName = currStateNameI.value;
      stateNames.push(currStateName);
    }
  
    stateSelectDrop.selectAll("option")
    .data(stateNames)
    .join("option")
    .property("value", (d) => {
      if(d == "Entire US") {
        return "US";
      } else {
        return stateNameToID.get(d);
      }
    })
    .text(d=>d);
}

// Acquire info about all years available in energy & CO2 data & generate user input dropdown based on it
// + set initial year
// NOTE: assumes user input is locked in the process; and does not unlock it (needs an outer layer function to do so)
async function initializeYears() {
  // can't use metadata: it gives only full date range (largest range), not range when all vals needed are available

  // count large-scale ids (4*2 for energy, 13 for electricity (variously dispersed), 1*2 for imports, 5 + 3 for CO2)
  let idCount = 0;
  idCount += consumption.size * 2;
  for(let currElecPiece of electricity.values()) {
    idCount += currElecPiece.ids.length;
  }
  idCount += elecOther.ids.length;
  idCount += elecImport.ids.length;
  idCount += co2.map.size; // CO2 ids overlap oddly hence the plus not multiply
  idCount += co2.ids.size;

  allYearFullsEnergyPromise = d3.json(composeQueryString("energy", null, "US", null, null));
  allYearFullsElectricityPromise = d3.json(composeQueryString("electricity", null, "US", null, null));
  allYearFullsImportPromise = d3.json(composeQueryString("import", null, "US", null, null));
  allYearFullsCO2Promise = d3.json(composeQueryString("CO2", null, "US", null, null));

  allYearFullsEnergy = await allYearFullsEnergyPromise;
  allYearFullsElectricity = await allYearFullsElectricityPromise;
  allYearFullsImport = await allYearFullsImportPromise;
  allYearFullsCO2 = await allYearFullsCO2Promise;

  yearsContained = new Map();

  // map each year to the series ids that have values for it
  for(let currFull of allYearFullsEnergy.response.data) {
    let currYear = parseInt(currFull["period"]);

    if(!yearsContained.has(currYear)) {
      yearsContained.set(currYear, {"energy": new Set()}); // must be separate since some IDs overlap
    }

    yearsContained.get(currYear)["energy"].add(currFull["seriesId"]);
  }
  for(let currFull of allYearFullsElectricity.response.data) {
    let currYear = parseInt(currFull["period"]);

    // if year not contained yet in map, already know it's not in the energy pull, so it'd be eliminated
    // at the end anyway
    if(yearsContained.has(currYear)) {
      if(!("electricity" in yearsContained.get(currYear))) {
        yearsContained.get(currYear)["electricity"] = new Set();
      }
      yearsContained.get(currYear)["electricity"].add(currFull["fueltypeid"]);
    }
  }
  for(let currFull of allYearFullsImport.response.data) {
    let currYear = parseInt(currFull["period"]);

    if(yearsContained.has(currYear)) {
      if(!("import" in yearsContained.get(currYear))) {
        yearsContained.get(currYear)["import"] = new Set();
      }
      yearsContained.get(currYear)["import"].add(currFull["seriesId"]);
    }
  }
  for(let currFull of allYearFullsCO2.response.data) {
    let currYear = parseInt(currFull["period"]);

    if(yearsContained.has(currYear)) {
      if(!("co2" in yearsContained.get(currYear))) {
        yearsContained.get(currYear)["co2"] = new Set();
      }
      yearsContained.get(currYear)["co2"].add(currFull["fuelId"]);
      yearsContained.get(currYear)["co2"].add(currFull["sectorId"]);
    }
  }

  // only add to options those years which have values for all ids queried
  let years = [];
  for(let currYear of yearsContained.keys()) {
    let currSize = 0;
    for(let currSet of Object.values(yearsContained.get(currYear))) {
      currSize += currSet.size;
    }
    if(currSize == idCount) {
      years.push(currYear);
    }
  }

  // initialize the HTML element with available years
  let yearSelectDrop = d3.select("#year-select-drop");

  yearSelectDrop.selectAll("option")
  .data(years)
  .join("option")
  .property("value", d=>d)
  .text(d=>d);

  year = years[0]; // will be latest year, due to sorting of request & JavaScript map key ordering mechanics
}

// Acquire per-sector fuel consumption info for current-set state and year and store in the EnergySubsets
// Acquire per-fuel electricity generation & imports info for current-set state and year and store in ElectricityPieces
// NOTE: assumes user input is locked in the process; and does not unlock it (needs an outer layer function to do so)
async function pullStoreData() {
    // pull entire API call at once per object type, then go through values and sift them into the corresponding object spaces
    // for energy, due to convolution, also check that it sums to total at end, and throw error if not
  
    // query for query strings & await Promise resolution
    let allFullsEnergyPromise = d3.json(composeQueryString("energy", "value", state, (year-1), (year+1)));
    let allFullsElectricityPromise = d3.json(composeQueryString("electricity", "generation", state, (year-1), (year+1)))
    let allFullsImportPromise = d3.json(composeQueryString("import", "value", state, (year-1), (year+1)));
    let allFullsCO2Promise = d3.json(composeQueryString("CO2", "value", state, (year-1), (year+1)));
    
    let allFullsEnergy = await allFullsEnergyPromise;
    let allFullsElectricity = await allFullsElectricityPromise;
    let allFullsImport = await allFullsImportPromise;
    let allFullsCO2 = await allFullsCO2Promise;
  
    storeEnergyData(allFullsEnergy);
    storeElectricityData(allFullsElectricity, allFullsImport);
    storeCO2Data(allFullsCO2);
}

// Visualize & print relevant text for the energy data contained in one or all of the four sector boxes (bar graph charts)
// Optional argument tells it which sector to update; else, updates all four
function visualizeEnergyData(currSector = null) {
  // Calculate & compare upper bar graph bound
  let maxTotal = 0;
  let fullTotal = 0;
  for(let currSubset of consumption.values()) {
    maxTotal = Math.max(maxTotal, roundUpOneSigFig(currSubset.subSubsets.get("electric")["adjustedVal"]));
    maxTotal = Math.max(maxTotal, roundUpOneSigFig(currSubset.subSubsets.get("primary")["adjustedVal"]));
    fullTotal += currSubset.subSubsets.get("total")["adjustedVal"];
  }
  if(maxTotal != currEnergyBound) {
    currEnergyBound = maxTotal;
    if(currSector !== null) {
      // if upper bound was updated but we were only instructed to visualize one sector, must visualize all of them now
      visualizeEnergyData();
      return;
    }
  }

  // Display total
  d3.select(".container .titles")
    .text("Energy Consumed: " + formatCommas(fullTotal/GWhorGWDivisor) + " " + GWhorGW);

  // Do main visualization
  if(currSector === null) {
    for(let currKey of consumption.keys()) {
      visualizeEnergyData(currKey);
    }
  } else {
    let currSectorObj = consumption.get(currSector);
    let currPrimaryPieces = currSectorObj.subSubsets.get("primary").primaryPieces;

    // Print relevant slider values & outputs
    let currSectorBox = d3.select(".cell.sector-" + currSector);

    currSectorBox.select(".type-elec-efficiency > .slider").property("value", currSectorObj["adjustedElecEfficiency"]);
    currSectorBox.select(".type-elec-efficiency > .slider-output").text(formatCommas(currSectorObj["adjustedElecEfficiency"]));

    currSectorBox.select(".type-demand > .slider").property("value", currSectorObj["adjustedDemand"]);
    currSectorBox.select(".type-demand > .slider-output").text(currSectorObj["adjustedDemand"] + "%");

    currSectorBox.select(".type-electrification > .slider").property("value", currSectorObj["adjustedElectrification"]);
    if(Math.floor(currSectorObj["adjustedElectrification"]) < currSectorObj["adjustedElectrification"]) {
      // if this is the pulled electrification, it'll be to a higher level of precision than we allow it to be adjusted to, so display is slightly different
      currSectorBox.select(".type-electrification > .slider-output").text(formatCommas(currSectorObj["adjustedElectrification"]) + "%");
    } else {
      currSectorBox.select(".type-electrification > .slider-output").text(currSectorObj["adjustedElectrification"] + "%");
    }

    // Layout number specifics
    let currMargin = 20;
    let currLeftMargin = 70;
    let currHeight = parseInt(d3.select(".cell .vis").style("height").slice(0, -2));
    let currWidth = parseInt(d3.select(".cell .vis").style("width").slice(0, -2));

    // Create object usable by the vis
    let currData = [];
    let currStacks = ["Electric", "Primary"];

    // We need the groups key array to have all not green, then all green, so that the stack has them in separate chunks
    let currGroups = [];
    for(let currKey of currPrimaryPieces.keys()) {
      if(!greenSet.has(currKey)) {
        currGroups.push(currKey);
      }
    }
    for(let currKey of currPrimaryPieces.keys()) {
      if(greenSet.has(currKey)) {
        currGroups.push(currKey);
      }
    }
    currGroups.push("electric");

    currData.push({stack: "Electric", group: "electric", val: currSectorObj.subSubsets.get("electric")["adjustedVal"]}) 
    for(let currKey of currPrimaryPieces.keys()) {
      currData.push({"stack": "Primary", "group": currKey, "val": currPrimaryPieces.get(currKey)["adjustedVal"]})
    }

    let stackedData = d3.stack()
      .keys(currGroups)
      .value(([, d], key) => { // this uses this format because the data is the index created by the below, aka a nested map by the 2 keys (so d is inner map)
        if(d.has(key)) {
          return d.get(key)["val"];
        } else {
          return 0;
        }
      }) 
      (d3.index(currData, d=>d.stack, d=>d.group));
    
    let yScale = d3.scaleLinear()
      .domain([0, currEnergyBound])
      .range([currHeight - currMargin, currMargin]) // max functions use array + accessor (nested)
    let xScale = d3.scaleBand()
      .domain(currStacks)
      .range([currLeftMargin, currWidth - currMargin]) 
      .padding(0.1);
  
    // Bars
    currSectorBox.select(".vis")
      .selectAll("g")
      .data(stackedData, d=>d) // key necessary to avoid weird absorption of axes' groups from below when amount of data changes
      .join("g") // this also cleans out prior iterations' axes
        .attr("fill", (d) => {
          if(greenSet.has(d.key) || d.key === "electric") {
            return colorMap.get(d.key)["green"];
          } else {
            return colorMap.get(d.key)["ngreen"];
          }
        })
      .selectAll("rect")
        .data((d) => {
          let currArr = [];
          for(let currRect of d) {
            currArr.push({"key": d.key, "rect": currRect});
          }
          return currArr;
        })
        .join("rect")
        .attr("x", d=>xScale(d.rect.data[0]))
        .attr("y", d=>yScale(d.rect[1]))
        .attr("height", function(d) { 
          return yScale(d.rect[0]) - yScale(d.rect[1]); 
        })
        .attr("width", xScale.bandwidth())
        .on("mouseover", (event, d) => {

          let currRectData = d;

          let tooltip = d3.select(".tooltip");

          tooltip.style("visibility", "visible")
      
          tooltip.select(".subtitles")
            .text((d) => {return currRectData.key.split(" ").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ")});

          tooltip.select(".line-1")
            .text((d) => {
              if(currRectData.key === "electric") {
                return (formatCommas((consumption.get(currSector).subSubsets.get("electric")["adjustedVal"])/GWhorGWDivisor) + " " + GWhorGW);
              } else {
                return (formatCommas((consumption.get(currSector).subSubsets.get("primary").primaryPieces.get(currRectData.key)["adjustedVal"])
                  /GWhorGWDivisor) + " " + GWhorGW);
              }
              
            });

          tooltip.select(".line-2")
            .text((d) => {
              if(currRectData.key === "electric") {
                return (formatCommas((consumption.get(currSector).subSubsets.get("electric")["adjustedVal"] /
                                    consumption.get(currSector).subSubsets.get("total")["adjustedVal"]) * 100) + "% of " 
                                    + currSector.split(" ").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" "));
              } else {
                return (formatCommas((consumption.get(currSector).subSubsets.get("primary").primaryPieces.get(currRectData.key)["adjustedVal"] /
                                    consumption.get(currSector).subSubsets.get("total")["adjustedVal"]) * 100) + "% of " + 
                                    currSector.split(" ").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" "));
              }
            });
        })
        .on("mousemove", (event, d) => {
          let tooltip = d3.select(".tooltip");

          let setXTo = event.pageX + 10 + "px";
          let setYTo = event.pageY - 10;
      
          if(event.pageY/window.innerHeight > 0.5) {
            // "Flip" tooltip if it's over halfway down the page
            let tooltipSize = tooltip.property("clientHeight");
            setYTo -= tooltipSize;
          }
          setYTo += "px";
      
          tooltip.style("top", setYTo)
            .style("left", setXTo);
        })
        .on("mouseout", (event, d) => {
          let tooltip = d3.select(".tooltip");

          tooltip.style("visibility", "hidden");
        });
  
    // X-axis
    currSectorBox.select(".vis")
      .append("g")
      .attr("transform", "translate(0, " + (currHeight - currMargin) + ")")
      .attr("class", "mini-text")
      .call(d3.axisBottom(xScale).tickSizeOuter(0));
  
    // Y-axis
    currSectorBox.select(".vis")
      .append("g")
      .attr("transform", "translate(" + currLeftMargin + ", 0)")
      .attr("class", "mini-text")
      .call(d3.axisLeft(yScale).tickValues([0, currEnergyBound]));
  }
}

// Visualize & print relevant text for the electricity generation & import data contained at the bottom
function visualizeElectricityData() {

  let electricityBox = d3.select(".electricity");

  // Electricity generation
  for(let currElectricityPiece of electricity.values()) {
    let currHTMLKey = currElectricityPiece.key.replace(/\s+/, '-');
    let currPieceBox = electricityBox.select(".input-container.type-piece-" + currHTMLKey);
    currPieceBox.select(".slider").property("value", currElectricityPiece["adjustedDemand"]);
    currPieceBox.select(".slider-output").text(formatCommas(currElectricityPiece["adjustedDemand"]) + "%,  " + 
      formatCommas(currElectricityPiece["adjustedVal"]/GWhorGWDivisor) + " " + GWhorGW);
  }

  // Other
  let otherBox = electricityBox.select(".output-container.type-piece-other");
  otherBox.select(".output").text(formatCommas(elecOther["adjustedDemand"]) + "%,  " + 
    formatCommas(elecOther["baseVal"]/GWhorGWDivisor) + " " + GWhorGW);

  // Imports
  let importBox = electricityBox.select(".output-container.type-piece-import");
  importBox.select(".output").text(formatCommas(elecImport["adjustedDemand"]) + "%,  " +
    formatCommas(elecImport["baseVal"]/GWhorGWDivisor) + " " + GWhorGW);

  // Transmission efficiency
  let transEffBox = electricityBox.select(".input-container.type-transmission-efficiency");
  transEffBox.select(".slider").property("value", transmissionEfficiency);
  transEffBox.select(".slider-output").text(formatCommas(transmissionEfficiency));

  // Calculate & display difference between available and needed electricity (taking into account the transmission efficiency)
  // Also display total generation
  let currElecDifference = 0;
  let currElecGeneration = 0;
  for(let currSubset of consumption.values()) {
    currElecDifference += currSubset.subSubsets.get("electric")["adjustedVal"];
  }
  for(let currElectricityPiece of electricity.values()) {
    currElecDifference -= currElectricityPiece["adjustedVal"] * transmissionEfficiency;
    currElecGeneration += currElectricityPiece["adjustedVal"];
  }
  currElecDifference -= elecOther["baseVal"] * transmissionEfficiency;
  currElecGeneration += elecOther["baseVal"];
  currElecDifference -= elecImport["baseVal"] * transmissionEfficiency;
  currElecGeneration += elecImport["baseVal"];

  if(currElecDifference >= 0) {
    electricityBox.select(".demand-output").text("Demand remaining to fill: " + formatCommas(currElecDifference/GWhorGWDivisor) + " " + GWhorGW);
  } else {
    electricityBox.select(".demand-output").text("Over demand by: " + formatCommas(-currElecDifference/GWhorGWDivisor) + " " + GWhorGW);
  }
  electricityBox.select(".generation-output").text("Electricity Generation & Import: " + formatCommas(currElecGeneration/GWhorGWDivisor) + " " + GWhorGW);

  // Visualize
  // Set up JSON object of values to visualize
  var currJson = {
    name: "Electricity Generation In " + state + " By Pieces",
    children: [
      {
        "name": "Clean Electricity",
        "children": [] 
      },
      {
        "name": "Non-Clean Electricity",
        "children": []
      }
    ]
  }

  for(let currElectricityPiece of electricity.values()) {
    // Don't add the 0-gen pieces to the vis, they only make it rearrange when not necessary
    // Also don't add the negatives (there aren't any big ones & negatives can't be visualized here)
    if(currElectricityPiece["adjustedVal"] <= 0) {
      continue;
    }

    if(greenSet.has(currElectricityPiece["key"])) {
      currJson.children[0].children.push({"key": currElectricityPiece["key"], "val": currElectricityPiece["adjustedVal"]});
    } else {
      currJson.children[1].children.push({"key": currElectricityPiece["key"], "val": currElectricityPiece["adjustedVal"]});
    }
  }

  if(elecOther["adjustedVal"] > 0) {
    currJson.children[1].children.push({"key": "other", "val": elecOther["adjustedVal"]});
  }
  if(elecImport["adjustedVal"] > 0) {
    currJson.children[1].children.push({"key": "import", "val": elecImport["adjustedVal"]});
  }

  var currHierarchy = d3.hierarchy(currJson) // adds depth, height, parent to the data
                        .sum(d=>d["val"])
                        .sort((a,b) => b["val"] - a["val"]); // sort in descending order

  // Set up the dimensions of a treemap, then pass the data to it
  var currTreemap = d3.treemap()
                      .tile(d3.treemapSliceDice) // make the subsections in logs rather than jumbled
                      .size([d3.select(".electricity .vis").style("width").slice(0, -2), d3.select(".electricity .vis").style("height").slice(0, -2)])
                      .padding(1);
  var currRoot = currTreemap(currHierarchy); // determines & assigns x0, x1, y0, & y1 attrs for the data

  // Now we can make rect elements of these nodes & append them to an svg element on the screen
  var svgVis = d3.select(".electricity .vis");

  svgVis.selectAll("rect") // by the D3 update pattern it creates new rects upon the "join()" call
     .data(currRoot.leaves().filter(d=>d.depth == 2))
     .join("rect")
     .attr("x", d=>d.x0)
     .attr("y", d=>d.y0)
     .attr("width", d=>d.x1-d.x0)
     .attr("height", d=>d.y1-d.y0)
     .attr("fill", (d) => {
        if(greenSet.has(d.data.key)) {
          return colorMap.get(d.data.key)["green"];
        } else {
          return colorMap.get(d.data.key)["ngreen"];
        }
     })
     .on("mouseover", (event, d) => {

      let currRectData = d.data;

      let tooltip = d3.select(".tooltip");

      tooltip.style("visibility", "visible")
  
      tooltip.select(".subtitles")
        .text((d) => {return currRectData.key.split(" ").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ")});

      tooltip.select(".line-1")
        .text((d) => {
          return (formatCommas(currRectData.val/GWhorGWDivisor) + " " + GWhorGW);
        });

      tooltip.select(".line-2")
        .text((d) => {
          let currElectricitySum = 0;
          for(let currElecPiece of electricity.values()) {
            currElectricitySum += currElecPiece["adjustedVal"];
          }
          currElectricitySum += elecOther["adjustedVal"];
          currElectricitySum += elecImport["adjustedVal"];

          return (formatCommas((currRectData.val / currElectricitySum) * 100) + "%");
        });
    })
    .on("mousemove", (event, d) => {
      let tooltip = d3.select(".tooltip");

      let setXTo = event.pageX + 10 + "px";
      let setYTo = event.pageY - 10;
  
      if(event.pageY/window.innerHeight > 0.5) {
        // "Flip" tooltip if it's over halfway down the page
        let tooltipSize = tooltip.property("clientHeight");
        setYTo -= tooltipSize;
      }
      setYTo += "px";
  
      tooltip.style("top", setYTo)
        .style("left", setXTo);
    })
    .on("mouseout", (event, d) => {
      let tooltip = d3.select(".tooltip");

      tooltip.style("visibility", "hidden");
    });
}

// Visualize & print relevant text for the CO2 output
function visualizeCO2Data() {
  // Print
  let currCO2Total = 0;
  for(let currSubset of co2.map.values()) {
    for(let currCO2Piece of currSubset.co2Pieces.values()) {
      currCO2Total += currCO2Piece["adjustedVal"];
    }
  }
  d3.select(".co2 .titles").text("CO2: " + formatCommas(currCO2Total) + " Million Metric Tons");

  // Visualize
  let currJson = {
    name: "CO2 Emissions In " + state + " By Sector & Pieces",
    children: [{children: []}] // double wrapped to circumvent d3's treemap layout horizontal/vertical ordering
  }

  for(let currSubset of co2.map.values()) {
    let currPush = {"sector": currSubset["key"], "children": []};
    for(let currCO2Piece of currSubset.co2Pieces.values()) {
      currPush.children.push({"sector": currSubset["key"], "key": currCO2Piece["key"], "val": currCO2Piece["adjustedVal"]});
    }

    currJson.children[0].children.push(currPush);
  }
  
  let currHierarchy = d3.hierarchy(currJson) // adds depth, height, parent to the data
                        .sum(d=>d["val"])
                        .sort((a,b) => b["val"] - a["val"]); // sort in descending order

  // Set up the dimensions of a treemap, then pass the data to it
  let currTreemap = d3.treemap()
    .tile(d3.treemapSliceDice) // make the subsections in logs rather than jumbled
    .size([d3.select(".co2 .vis").style("width").slice(0, -2), d3.select(".co2 .vis").style("height").slice(0, -2)])
    .padding(1);
  let currRoot = currTreemap(currHierarchy); // determines & assigns x0, x1, y0, & y1 attrs for the data

  // Now we can make rect elements of these nodes & append them to an svg element on the screen
  let svgVis = d3.select(".co2 .vis");

  svgVis.selectAll("rect") // by the D3 update pattern it creates new rects upon the "join()" call
    .data(currRoot.leaves().filter(d=>d.depth == 3))
    .join("rect")
    .attr("x", d=>d.x0)
    .attr("y", d=>d.y0)
    .attr("width", d=>d.x1-d.x0)
    .attr("height", d=>d.y1-d.y0)
    .attr("fill", (d) => {
        if(greenSet.has(d.data.key)) {
          return colorMap.get(d.data.key)["green"];
        } else {
          return colorMap.get(d.data.key)["ngreen"];
        }
    })
    .on("mouseover", (event, d) => {

      let currRectData = d.data;

      let tooltip = d3.select(".tooltip");

      tooltip.style("visibility", "visible")
  
      tooltip.select(".subtitles")
        .text((d) => {return currRectData.sector.split(" ").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ") + 
          " " + currRectData.key.split(" ").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ")});

      tooltip.select(".line-1")
        .text((d) => {
          return (formatCommas(currRectData.val) + " Million Metric Tons");
        });

      tooltip.select(".line-2")
        .text((d) => {
          let currCO2Sum = 0;
          for(let currCO2Piece of co2.map.get(currRectData.sector).co2Pieces.values()) {
            currCO2Sum += currCO2Piece["adjustedVal"];
          }

          return (formatCommas((currRectData.val / currCO2Sum) * 100) + "% of " + 
            currRectData.sector.split(" ").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" "));
        });
    })
    .on("mousemove", (event, d) => {
      let tooltip = d3.select(".tooltip");

      let setXTo = event.pageX + 10 + "px";
      let setYTo = event.pageY - 10;
  
      if(event.pageY/window.innerHeight > 0.5) {
        // "Flip" tooltip if it's over halfway down the page
        let tooltipSize = tooltip.property("clientHeight");
        setYTo -= tooltipSize;
      }
      setYTo += "px";
  
      tooltip.style("top", setYTo)
        .style("left", setXTo);
    })
    .on("mouseout", (event, d) => {
      let tooltip = d3.select(".tooltip");

      tooltip.style("visibility", "hidden");
    });
}

// Visualize color legend and print associated values (unified for all data)
function visualizeLegend() {
  printLegendPiece(true);
  printLegendPiece(false);
}

// -----------------------------------------------------
// ---Helper Functions: ---
// -----------------------------------------------------
// (functions used for pieces of larger-function tasks, or repeated tasks, for clarity of reading)

// For initialize()
// Make the state to ID mappings
function initializeStateNameToID() {
    stateNameToID.set("Alabama", "AL").set("Alaska", "AK").set("Arizona", "AZ").set("Arkansas", "AR").set("California", "CA").set("Colorado", "CO")
    .set("Connecticut", "CT").set("D.C.", "DC").set("Delaware", "DE").set("Florida", "FL").set("Georgia", "GA").set("Hawaii", "HI").set("Idaho", "ID").set("Illinois", "IL")
    .set("Indiana", "IN").set("Iowa", "IA").set("Kansas", "KS").set("Kentucky", "KY").set("Louisiana", "LA").set("Maine", "ME").set("Maryland", "MD")
    .set("Massachusetts", "MA").set("Michigan", "MI").set("Minnesota", "MN").set("Mississippi", "MS").set("Missouri", "MO").set("Montana", "MT").set("Nebraska", "NE")
    .set("Nevada", "NV").set("New Hampshire", "NH").set("New Jersey", "NJ").set("New Mexico", "NM").set("New York", "NY").set("North Carolina", "NC")
    .set("North Dakota", "ND").set("Ohio", "OH").set("Oklahoma", "OK").set("Oregon", "OR").set("Pennsylvania", "PA").set("Rhode Island", "RI")
    .set("South Carolina", "SC").set("South Dakota", "SD").set("Tennessee", "TN").set("Texas", "TX").set("Utah", "UT").set("Vermont", "VT").set("Virginia", "VA")
    .set("Washington", "WA").set("West Virginia", "WV").set("Wisconsin", "WI").set("Wyoming", "WY");
}

// For updateState(), updateYear()
// Disables all user input elements
function disableUserInput() {
    d3.select("#state-select-drop")
        .property("disabled", true);
    d3.select("#year-select-drop")
        .property("disabled", true);
    d3.select("#GWh-or-GW-drop")
        .property("disabled", true);
    d3.select("#green-select").selectAll("input")
        .property("disabled", true);
    d3.select("#exclude-transportation-select").selectAll("input")
        .property("disabled", true);
    d3.select("#show-efficiencies").select("input")
        .property("disabled", true);
    d3.selectAll(".cell .slider")
        .property("disabled", true);
    d3.selectAll(".electricity .slider, .button")
        .property("disabled", true);
}

// For initialize(), updateState(), updateYear()
// Enables all user input elements
function enableUserInput() {
    d3.select("#state-select-drop")
        .attr("disabled", null);
    d3.select("#year-select-drop")
        .attr("disabled", null);
    d3.select("#GWh-or-GW-drop")
        .attr("disabled", null);
    d3.select("#green-select").selectAll("input")
        .attr("disabled", null);
    d3.select("#exclude-transportation-select").selectAll("input")
        .attr("disabled", null);
    d3.select("#show-efficiencies").select("input")
        .attr("disabled", null);
    d3.selectAll(".cell .slider")
        .attr("disabled", null);
    d3.selectAll(".electricity .slider, .button")
        .attr("disabled", null);
}

// For updateSectorSlider(), updateElecEfficiency(), updateExcludeTransportationSet()
// Calculates & store the current adjustedVals for the subSubsets & primary pieces of passed in sector based on the current
// baseVals, adjustedDemand, adjustedElectrification, and green/excluded pieces
function calculateStoreAdjustedVals(currSector) {
    let currSubset = consumption.get(currSector);

    // from base val & electrification, we first scale the val by demand percent, then shift pieces to fit the electrification percent
    let scaledPrimary = (currSubset.subSubsets.get("primary")["baseVal"] * (currSubset["adjustedDemand"] / 100));
    let scaledElectric = (currSubset.subSubsets.get("electric")["baseVal"] * (currSubset["adjustedDemand"] / 100));

    // electrification % = electric/total energy
    // electric energy essentially has the efficiency factor included within itself
    // thus (scaledElectric + x*eff) / ((scaledPrimary - x) + (scaledElectric + x*eff)) = new electrification %, calculate for x to find amount to move
    // x = (elec%*(scaledPrimary + scaledElectric) - scaledElectric)/(eff - elec%*eff + elec%)

    let toMove = ((currSubset["adjustedElectrification"] / 100) * (scaledPrimary + scaledElectric) - scaledElectric) / 
      (currSubset["adjustedElecEfficiency"] - (currSubset["adjustedElectrification"] / 100)*currSubset["adjustedElecEfficiency"] + (currSubset["adjustedElectrification"] / 100));

    currSubset.subSubsets.get("primary")["adjustedVal"] = scaledPrimary - toMove;
    currSubset.subSubsets.get("electric")["adjustedVal"] = scaledElectric + (toMove * currSubset["adjustedElecEfficiency"]);
    currSubset.subSubsets.get("total")["adjustedVal"] = currSubset.subSubsets.get("primary")["adjustedVal"] + currSubset.subSubsets.get("electric")["adjustedVal"];

    let unelectrifiableSumBase = 0;
    for(let currKey of currSubset.subSubsets.get("primary").primaryPieces.keys()) {
      if(greenSet.has(currKey) || exclude.has(currKey)) {
        unelectrifiableSumBase += currSubset.subSubsets.get("primary").primaryPieces.get(currKey)["baseVal"];
      }
    }

    for(let currKey of currSubset.subSubsets.get("primary").primaryPieces.keys()) {
      let currPrimaryPiece = currSubset.subSubsets.get("primary").primaryPieces.get(currKey);
      
      if(greenSet.has(currKey) || exclude.has(currKey)) {
        // if this primary piece is green or excluded, it is simply scaled with demand: none of it is electrified
        currPrimaryPiece["adjustedVal"] = currPrimaryPiece["baseVal"] * (currSubset["adjustedDemand"] / 100);
      } else {
        // else it must be scaled then proportionally electrified, excluding greens from the proportion
        currPrimaryPiece["adjustedVal"] = (currPrimaryPiece["baseVal"]) * (currSubset["adjustedDemand"] / 100)
          - (toMove * (currPrimaryPiece["baseVal"]/(currSubset.subSubsets.get("primary")["baseVal"] - unelectrifiableSumBase)));
      }

      if(currPrimaryPiece["adjustedVal"] < roundToZero) { // round
        currPrimaryPiece["adjustedVal"] = 0;
      }
    }
}

// For updateSectorSlider(), updateElecEfficiency(), updateElectricity(), updateExcludeTransportationSet(), updateEqualizeDemand()
// Calculates & store the current adjustedVals for the CO2 of passed in sector or electric, based on the current
// energy & electricity maps
function calculateStoreAdjustedCO2(currSector) {
  let currSubset = co2.map.get(currSector);

  for(let currCO2Piece of currSubset.co2Pieces.values()) {
    if(currSector === "electric") {
      currCO2Piece["adjustedVal"] = currCO2Piece["factor"] * electricity.get(currCO2Piece["key"])["adjustedVal"];
    } else {
      currCO2Piece["adjustedVal"] = currCO2Piece["factor"] * consumption.get(currSector).subSubsets.get("primary")
        .primaryPieces.get(currCO2Piece["key"])["adjustedVal"];
    }    
    if(currCO2Piece["adjustedVal"] < roundToZero) { // round
      currCO2Piece["adjustedVal"] = 0;
    }
  }
}

// For initializeYears(), pullStoreData()
// queryType: "energy", "CO2", "electricity", or "import"
// Composes an EIA energy, CO2, electricity, or electricity import data query string with optional query, stateId, start, and end dates, 
// with current EIA API key and instructions to return annually & sort returned data by date in descending order
// (primary pieces are skipped in case of null query - used for year initialization)
function composeQueryString(queryType, query, stateId, start, end) {
    let allQueryString = "";
  
    if(queryType === "energy" || queryType === "import") {
      allQueryString = "https://api.eia.gov/v2/seds/data/?";
    } else if(queryType === "electricity") {
      allQueryString = "https://api.eia.gov/v2/electricity/electric-power-operational-data/data/?";
    } else if(queryType === "CO2") {
      allQueryString = "https://api.eia.gov/v2/co2-emissions/co2-emissions-aggregates/data/?";
    } else {
      throw new Error("Unexpected value in queryType: " + queryType);
    }
  
    allQueryString = allQueryString + "api_key=" + eiaKey + "&frequency=annual" + 
      "&sort[0][column]=period&sort[0][direction]=desc&offset=0";
  
    if(query !== null) {
      allQueryString += ("&data[0]=" + query);
    }
    if(stateId !== null) {
      if(queryType === "electricity") {
        allQueryString += ("&facets[location][]=" + stateId);
      } else {
        allQueryString += ("&facets[stateId][]=" + stateId);
      }
    }
    if(start !== null) {
      allQueryString += ("&start=" + start);
    }
    if(end !== null) {
      allQueryString += ("&end=" + end);
    }
  
    // add every ID we need to query for to the string
    if(queryType === "energy") {
      for(let currSubset of consumption.values()) {
        allQueryString += ("&facets[seriesId][]=" + currSubset.subSubsets.get("electric").idEnergy);
        allQueryString += ("&facets[seriesId][]=" + currSubset.subSubsets.get("total").idEnergy);
  
        if(query !== null) { // if we're not just years-initializing, query for the little pieces too
          for(let currPrimaryPiece of currSubset.subSubsets.get("primary").primaryPieces.values()) {
            for(let currID of currPrimaryPiece.idToVal.keys()) {
              if(currID !== null) {
                allQueryString += ("&facets[seriesId][]=" + currID);
              }
            }
          }
          // pull exclude values even if they are not currently active (may double pull them, but storage won't double store)
          for(let currPiece of exclude.values()) {
            for(let currID of currPiece.idToVal.keys()) {
              if(currID !== null) {
                allQueryString += ("&facets[seriesId][]=" + currID);
              }
            }
          }
        }
      }
    } else if(queryType === "electricity") { 
      for(let currElectricityPiece of electricity.values()) {
        for(let currID of currElectricityPiece["ids"]) {
          allQueryString += ("&facets[fueltypeid][]=" + currID);
        }
      }
      for(let currID of elecOther["ids"]) {
        allQueryString += ("&facets[fueltypeid][]=" + currID);
      }
      allQueryString += ("&facets[sectorid][]=98");
    } else if(queryType === "import") {
      for(let currID of elecImport["ids"]) {
        allQueryString += ("&facets[seriesId][]=" + currID);
      }
    } else if(queryType === "CO2") {
      for(let currPieceID of co2.ids.keys()) {
        allQueryString += ("&facets[fuelId][]=" + currPieceID);
      }
  
      for(let currSubset of co2.map.values()) {
        allQueryString += ("&facets[sectorId][]=" + currSubset["id"]);
      }
    } else {
      throw new Error("Unexpected value in queryType: " + queryType);
    }
  
    return allQueryString;
}

// For pullStoreData()
// Dissects & stores EIA API response data for in the sector energy values map for the current-set year & state
// If no data for some value, assumes it 0
function storeEnergyData(allFullsEnergy) {

    // Set all vals as 0 to avoid leftover prior values in case of data gaps + adjustedElecEfficiency back to its base val
    for(let currSubset of consumption.values()) {
        currSubset["adjustedDemand"] = 0;
        currSubset["adjustedElectrification"] = 0;
        currSubset["adjustedElecEfficiency"] = currSubset["baseElecEfficiency"];

        for(let currSubSubset of currSubset.subSubsets.values()) {
            currSubSubset["baseVal"] = 0;
            currSubSubset["adjustedVal"] = 0;
        }

        for(let currPrimaryPiece of currSubset.subSubsets.get("primary").primaryPieces.values()) {
            currPrimaryPiece["baseVal"] = 0;
            currPrimaryPiece["adjustedVal"] = 0;

            for(let currVal of currPrimaryPiece.idToVal.values()) {
                currVal["baseVal"] = 0;
            }
        }
    }
    for(let currPiece of exclude.values()) {
      currPiece["baseVal"] = 0;

      for(let currVal of currPiece.idToVal.values()) {
        currVal["baseVal"] = 0;
      }
    }
  
    // isolate the requested values from the energy response & store them in the right spots
    // make sure to loop through all spots every time, because some values go to two spots (ex. if we're using the advanced setting of excluding
    // some fuels from electrification, their IDs will be subtracted from one primary piece, but added to another)
    for(let currFullEnergy of allFullsEnergy.response.data) {
      if(parseInt(currFullEnergy["period"]) !== year) {
        continue; // we fetched several years near current year due to variable API mechanics, so cycle past irrelevant ones
      }
  
      if(currFullEnergy["unit"] !== "Billion Btu" || currFullEnergy["stateId"] !== state) { // year & series ID already checked above or below
        throw new Error("Unexpected unit or state ID mismatch in pulled API data with " + currFullEnergy);
      }
  
      let postConvert;
      if(isNaN(parseFloat(currFullEnergy["value"]))) {
        postConvert = 0;
      } else {
        // convert response val from Billion Btu to GWh
        let preConvert = parseFloat(currFullEnergy["value"]);
        postConvert = preConvert * (1/3.412);
      }
  
      for(let currSubset of consumption.values()) {
        for(let currSubSubset of currSubset.subSubsets.values()) {
          if(currSubSubset["idEnergy"] === currFullEnergy["seriesId"]) {
            // store converted val in currSubSubset
            currSubSubset["baseVal"] = postConvert;
          } else if(currSubSubset["key"] === "primary") { // or it might be an ID for one of the primary pieces
            for(let currPrimaryPiece of currSubSubset.primaryPieces.values()) {
              for(let currID of currPrimaryPiece.idToVal.keys()) {
                if(currID === currFullEnergy["seriesId"]) {
                  currPrimaryPiece.idToVal.get(currID)["baseVal"] = postConvert;
                }
              }
            }
          }
        }
      }
      for(let currPiece of exclude.values()) {
        for(let currID of currPiece.idToVal.keys()) {
          if(currID === currFullEnergy["seriesId"]) {
            currPiece.idToVal.get(currID)["baseVal"] = postConvert;
          }
        }
      }
    }
  
    // derive the primary values and primary pieces inner totals, "other" (leftover of what was pulled), and electrification %
    // & set adjusted pieces to start at base
    for(let currSubset of consumption.values()) {

      let currPrimary = currSubset.subSubsets.get("primary");
      currPrimary["baseVal"] = currSubset.subSubsets.get("total")["baseVal"] - currSubset.subSubsets.get("electric")["baseVal"]; // calculate primary
      currPrimary.primaryPieces.get("other")["baseVal"] = currPrimary["baseVal"]; // start other's val with primary total val
      for(let currPrimaryPiece of currPrimary.primaryPieces.values()) {
        // baseVal was set to 0 at start of function
        for(let currVal of currPrimaryPiece.idToVal.values()) {
          if(currVal["add"]) { 
            currPrimaryPiece["baseVal"] += currVal["baseVal"];
          } else {
            currPrimaryPiece["baseVal"] -= currVal["baseVal"];
          }
        }
  
        if(currPrimaryPiece["key"] !== "other") {
          currPrimary.primaryPieces.get("other")["baseVal"] -= currPrimaryPiece["baseVal"];
        }

        currPrimaryPiece["adjustedVal"] = currPrimaryPiece["baseVal"];
      }

      // after all the other-subtraction is over
      currPrimary.primaryPieces.get("other")["adjustedVal"] = currPrimary.primaryPieces.get("other")["baseVal"];

      currSubset.subSubsets.get("total")["adjustedVal"] = currSubset.subSubsets.get("total")["baseVal"];
      currSubset.subSubsets.get("primary")["adjustedVal"] = currSubset.subSubsets.get("primary")["baseVal"];
      currSubset.subSubsets.get("electric")["adjustedVal"] = currSubset.subSubsets.get("electric")["baseVal"];

      currSubset["adjustedDemand"] = 100;
      currSubset["adjustedElectrification"] = 100 * (currSubset.subSubsets.get("electric")["baseVal"])/(currSubset.subSubsets.get("total")["baseVal"]);
    }
    for(let currPiece of exclude.values()) {
      for(let currVal of currPiece.idToVal.values()) {
        if(currVal["add"]) { 
          currPiece["baseVal"] += currVal["baseVal"];
        } else {
          currPiece["baseVal"] -= currVal["baseVal"];
        }
      }
      // we don't set adjusted val for stored inactive pieces
    }
}

// For pullStoreData()
// Dissects & stores EIA API response data for in the electricity generation values map for the current-set year & state
// as well as storing the electricity other & import values and calculating base val total and initial transmission efficiency value
// If no data for some value, assumes it 0
// Some of these end up negative, but it's because in the pulled data itself, they are negative
function storeElectricityData(allFullsElecGen, allFullsImport) {  

  // Set all vals as 0 to avoid leftover prior values in case of data gaps
  for(let currElectricityPiece of electricity.values()) {
    currElectricityPiece["baseVal"] = 0;
    currElectricityPiece["adjustedVal"] = 0;
    currElectricityPiece["adjustedDemand"] = 0;
  }
  elecOther["baseVal"] = 0;
  elecOther["adjustedVal"] = 0;
  elecImport["baseVal"] = 0;
  elecImport["adjustedVal"] = 0;
  elecBaseGeneration = 0;
  transmissionEfficiency = 0;
  
  // Isolate pulled pieces + store
  for(let currFullElecGen of allFullsElecGen.response.data) {
    if(parseInt(currFullElecGen["period"]) !== year) {
      continue; // we fetched several years near current year due to variable API mechanics, so cycle past irrelevant ones
    }

    if(currFullElecGen["generation-units"] !== "thousand megawatthours" || currFullElecGen["location"] !== state) { // year & series ID already checked above or below
      throw new Error("Unexpected unit or state ID mismatch in pulled API data with " + currFullElecGen);
    }

    let postConvert;
    if(isNaN(parseFloat(currFullElecGen["generation"]))) {
      postConvert = 0;
    } else {
      postConvert = parseFloat(currFullElecGen["generation"]);
    }

    for(let currElectricityPiece of electricity.values()) {
      for(let currElectricityID of currElectricityPiece["ids"]) {
        if(currElectricityID === currFullElecGen["fueltypeid"]) { 
          currElectricityPiece["baseVal"] += postConvert;
        }
      }
    }
    for(let currElectricityID of elecOther["ids"]) {
      if(currElectricityID === currFullElecGen["fueltypeid"]) { 
        elecOther["baseVal"] += postConvert;
      }
    }
  }

  for(let currFullImport of allFullsImport.response.data) {
    if(parseInt(currFullImport["period"]) !== year) {
      continue; // we fetched several years near current year due to variable API mechanics, so cycle past irrelevant ones
    }

    if(currFullImport["unit"] !== "Million kilowatthours" || currFullImport["stateId"] !== state) { // year & series ID already checked above or below
      throw new Error("Unexpected unit or state ID mismatch in pulled API data with " + currFullEnergy);
    }

    let postConvert;
    if(isNaN(parseFloat(currFullImport["value"]))) {
      postConvert = 0;
    } else {
      postConvert = parseFloat(currFullImport["value"]);
    }

    for(let currImportID of elecImport["ids"]) {
      if(currImportID === currFullImport["seriesId"]) { 
        elecImport["baseVal"] += postConvert;
      }
    }
  }

  // Base val total & transmission efficiency
  for(let currElectricityPiece of electricity.values()) {
    elecBaseGeneration += currElectricityPiece["baseVal"];
  }
  elecBaseGeneration += elecImport["baseVal"];
  elecBaseGeneration += elecOther["baseVal"];

  let elecBaseConsumption = 0;
  for(let currSubset of consumption.values()) {
    elecBaseConsumption += currSubset.subSubsets.get("electric")["baseVal"];
  }
  
  transmissionEfficiency = elecBaseConsumption / elecBaseGeneration; 
  // generation but is recorded as consumption. maybe some pricing approximation. okay since it'll be in advanced just leave it as 1.04 but give a disclaimer

  // Set adjusted vals to start at base & percents of total base demand to be accurate
  for(let currElectricityPiece of electricity.values()) {
    currElectricityPiece["adjustedVal"] = currElectricityPiece["baseVal"];
    currElectricityPiece["adjustedDemand"] = 100 * currElectricityPiece["baseVal"]/elecBaseGeneration;
  }
  elecOther["adjustedVal"] = elecOther["baseVal"];
  elecOther["adjustedDemand"] = 100 * elecOther["baseVal"]/elecBaseGeneration;
  elecImport["adjustedVal"] = elecImport["baseVal"];
  elecImport["adjustedDemand"] = 100 * elecImport["baseVal"]/elecBaseGeneration;
}

// For pullStoreData()
// Dissects & stores EIA API response data for in the CO2 values map for the current-set year & state
// If no data for some value, assumes it 0
// NOTE: assumes energy & electricity data to be stored, used to calculate CO2 factors
function storeCO2Data(allFullsCO2) {
  
  // Set all vals as 0 to avoid leftover prior values in case of data gaps
  for(let currSubset of co2.map.values()) {
    for(let currCO2Piece of currSubset.co2Pieces.values()) {
      currCO2Piece["baseVal"] = 0;
      currCO2Piece["adjustedVal"] = 0;
      currCO2Piece["factor"] = 0;
    }
  }

  for(let currFullCO2 of allFullsCO2.response.data) {
    if(parseInt(currFullCO2["period"]) != year) {
      continue; // we fetched several years near current year due to variable API mechanics, so cycle past irrelevant ones
    }

    if(currFullCO2["value-units"] !== "million metric tons of CO2" || currFullCO2["stateId"] !== state) { // year & sector ID already checked
      throw new Error("Unexpected unit or state ID mismatch in pulled API data with " + currFullCO2 + " units " + currFullCO2["value-units"]);
    }

    let postConvert;
    if(isNaN(parseFloat(currFullCO2.value))) {
      postConvert = 0;
    } else {
      // read in response val
      postConvert = parseFloat(currFullCO2.value);
    }

    for(let currSubset of co2.map.values()) {
      if(currSubset["id"] === currFullCO2["sectorId"]) {
        let currPieceKey = co2.ids.get(currFullCO2["fuelId"]);
        currSubset.co2Pieces.get(currPieceKey)["baseVal"] = postConvert;
      }
    }
  }

  // Calculate factors & set adjusted vals to start at base + set all vals for sectors from advanced exclude settings (marine/aviation)
  // that don't correspond to IDs, and adjust petroleum's base val based on this
  for(let currSubset of co2.map.values()) {
    for(let currCO2Piece of currSubset.co2Pieces.values()) {
      if(!exclude.has(currCO2Piece["key"])) {
        if(currSubset["key"] === "electric") {
          currCO2Piece["factor"] = currCO2Piece["baseVal"] / electricity.get(currCO2Piece["key"])["baseVal"];
        } else {
          let currEnergyVal = consumption.get(currSubset["key"]).subSubsets.get("primary").primaryPieces.get(currCO2Piece["key"])["baseVal"];
  
          if(currSubset["key"] === "transportation" && currCO2Piece["key"] === "petroleum") {
            for(let currKey of exclude.keys()) { 
              if(consumption.get("transportation").subSubsets.get("primary").primaryPieces.has(currKey)) {
                currEnergyVal += consumption.get("transportation").subSubsets.get("primary").primaryPieces.get(currKey)["adjustedVal"]
              }
            }
          }
          currCO2Piece["factor"] = currCO2Piece["baseVal"] / currEnergyVal;
        }
        if(isNaN(currCO2Piece["factor"])) {
          currCO2Piece["factor"] = 0;
        }

        currCO2Piece["adjustedVal"] = currCO2Piece["baseVal"];
      }
    }
    // after first loop, deal with excludes' influence
    for(let currKey of exclude.keys()) {
      if(currSubset["key"] === "transportation" && currSubset.co2Pieces.has(currKey)) {
        currSubset.co2Pieces.get(currKey)["factor"] = currSubset.co2Pieces.get("petroleum")["factor"];
        currSubset.co2Pieces.get(currKey)["baseVal"] = consumption.get("transportation").subSubsets.get("primary").primaryPieces.get(currKey)["baseVal"] *
          currSubset.co2Pieces.get(currKey)["factor"];
        currSubset.co2Pieces.get(currKey)["adjustedVal"] = currSubset.co2Pieces.get(currKey)["baseVal"];

        currSubset.co2Pieces.get("petroleum")["baseVal"] -= currSubset.co2Pieces.get(currKey)["baseVal"];
        currSubset.co2Pieces.get("petroleum")["adjustedVal"] -= currSubset.co2Pieces.get(currKey)["adjustedVal"];
      }
    }
  }
}

// For updateSectorSlider(), updateElecEfficiency(), updateGreenSet(), updateExcludeTransportationSet()
// The min amount of primaries that can be left unelectrified is the green primaries: if the electrification % goes too high (or adjustedElecEfficiency changes 
// the max electrification %), it will be checked & reduced to its max value by the below, for some key of some currSubset. 
// Advanced settings can also let user exclude aviation & marine primaries from transportation sector electrification.
function preventGreenElectrification(currSector = null) {
  if(currSector === null) {
    for(let currSectorKey of consumption.keys()) {
      preventGreenElectrification(currSectorKey);
      return;
    }
  }

  let currSubset = consumption.get(currSector);

  // Because of electric efficiency factors, the calculation is not a plain ratio, rather:
  // 1 - max electrification % = unelectrifiable primaries base sum / total adjusted sum = 
  // unelectrifiable primaries base sum / (unelectrifiable primaries base sum + electric base + electrifiable primaries base sum * electric efficiency)
  // (since the electrifiable primaries in that case all get converted to electricity)
  // (this ignores demand % because this ratio will remain the same regardless; so unelectrifiable primaries base sum = unelectrifiable primaries 
  // adjusted sum for the above, as demand % = 100, and none of unelectrifiable primaries get electrified)

  let unelectrifiableSumBase = 0;
  for(let currKey of currSubset.subSubsets.get("primary").primaryPieces.keys()) {
    if(greenSet.has(currKey) || exclude.has(currKey)) {
      unelectrifiableSumBase += currSubset.subSubsets.get("primary").primaryPieces.get(currKey)["baseVal"];
    }
  }


  let electrifiableSumBase = currSubset.subSubsets.get("primary")["baseVal"] - unelectrifiableSumBase;
  let maxElectrification = 100 * (1 - unelectrifiableSumBase/(currSubset.subSubsets.get("primary")["baseVal"] - electrifiableSumBase 
    + currSubset.subSubsets.get("electric")["baseVal"] + electrifiableSumBase * currSubset["adjustedElecEfficiency"]));

  if(currSubset["adjustedElectrification"] > maxElectrification) {
    currSubset["adjustedElectrification"] = maxElectrification;
  }
}

// For visualizeLegend()
// Legend is visualized in two sections, green and ngreen, which are printed virtually the same, as below
function printLegendPiece(green) {
  let currArr = [];
  let currDiv;
  let size = 15;

  if(green) {
    for(currColorPiece of colorMap.keys()) {
      if(currColorPiece === "electric" || greenSet.has(currColorPiece)) {
        currArr.push({"key": currColorPiece});
      }
    }
    currDiv = d3.select(".legend > .vis-container.green");
  } else {
    for(currColorPiece of colorMap.keys()) { 
      if(currColorPiece !== "electric" && !greenSet.has(currColorPiece)) {
        if(!exclude.has(currColorPiece)) {
          currArr.push({"key": currColorPiece});
        } else {
          if(consumption.get("transportation").subSubsets.get("primary").primaryPieces.has(currColorPiece)) {
            currArr.push({"key": currColorPiece}); // don't visualize exclude-pieces that are not currently active
          }
        }
      }
    }
    currDiv = d3.select(".legend > .vis-container.ngreen");
  }

  currDiv.selectAll("svg")
    .data(currArr)
    .join("svg")
    .attr("height", (d) => { return size*8 + Array.from(consumption.keys()).length; })
    .each(function(d,i) { // passes each existing svg's data down into itself to create squares & text
      let currColorPiece = d.key;

      // title (ex. wind)
      d3.select(this).selectAll(".type")
        .data([currColorPiece])
        .join("text")
        .attr("class", "subtitles type")
        .attr("x", size*2)
        .attr("y", (d) => {return size*2;}
        )
        .text(d=>d.split(" ").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" "));

      // square
      d3.select(this).selectAll("rect")
        .data([currColorPiece])
        .join("rect")
        .attr("x", 0)
        .attr("y", size*1.7)
        .attr("width", size)
        .attr("height", size)
        .attr("fill", (d) => {
          if(d === "electric" || greenSet.has(d)) {
            return colorMap.get(d)["green"];
          } else {
            return colorMap.get(d)["ngreen"];
          }
        });

      // sectors & their values for this piece
      // if excluded piece, use only the transportation sector
      // if import piece, use only the electric sector
      // if electric piece, use no sectors
      let sectors = [];
      if(exclude.has(currColorPiece)) {
        sectors.push("transportation");
      } else if(currColorPiece === "import") {
        sectors.push("electric");
      } else if(currColorPiece !== "electric") {
        for(let currKey of consumption.keys()) {
          sectors.push(currKey);
        }
        sectors.push("electric");
      }
      
      d3.select(this).selectAll(".sector")
        .data(sectors)
        .join("text")
        .attr("class", "regular-text sector")
        .attr("x", size*2)
        .attr("y", (d, i) => { return (i+1)*(size + 2) + size*2})
        .text((d) => {
          let currPrint = "";
          
          currPrint += d.split(" ").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ") + ": ";
          if(d === "electric") {
            if(currColorPiece === "other") {
              currPrint += formatCommas(elecOther["adjustedVal"]/GWhorGWDivisor) + " " + GWhorGW;
            } else if(currColorPiece === "import") {
              currPrint += formatCommas(elecImport["adjustedVal"]/GWhorGWDivisor) + " " + GWhorGW;
            } else {
              currPrint += formatCommas(electricity.get(currColorPiece)["adjustedVal"]/GWhorGWDivisor) + " " + GWhorGW;
            }
          } else if(currColorPiece === "nuclear") {
            currPrint += "0 primary " + GWhorGW;
          } else {
            currPrint += formatCommas((consumption.get(d).subSubsets.get("primary").primaryPieces.get(currColorPiece)["adjustedVal"])
              /GWhorGWDivisor) + " primary " + GWhorGW;
          }
          if(Array.from(co2.ids.values()).includes(currColorPiece) || exclude.has(currColorPiece)) {
            let currCO2Sum = 0;
            if(!exclude.has(currColorPiece)) {
              for(let currCO2Subset of co2.map.values()) {
                currCO2Sum += currCO2Subset.co2Pieces.get(currColorPiece)["adjustedVal"];
              }
            } else {
              currCO2Sum = co2.map.get("transportation").co2Pieces.get(currColorPiece)["adjustedVal"];
            }

            currPrint += ", " + formatCommas(co2.map.get(d).co2Pieces.get(currColorPiece)["adjustedVal"]) + " million metric tons CO2";
          }
          
          return currPrint;
        });

      });
}

// For initialize() & updateState(), updateYear(), updateGreenSet(), updateExcludeTransportationSet(), updateSectorSlider(), updateElecEfficiency(),
// updateEqualizeDemand(), updateElectricity()
// Check that basic things sum up, with slight margin of error (10GWh, 1%, 0.01 million metric tons)
// (even though most are derived by subtracting from pulled pieces in the first place)
function checkTotalParts() { 
  for(let currSubset of consumption.values()) {
    let currPrimaryBaseSum = 0;
    let currPrimaryAdjustedSum = 0;
    let currPrimary = currSubset.subSubsets.get("primary");
    let currElectric = currSubset.subSubsets.get("electric");
    let currTotal = currSubset.subSubsets.get("total");

    for(let currPrimaryPiece of currPrimary.primaryPieces.values()) {
      currPrimaryBaseSum += currPrimaryPiece["baseVal"];
      currPrimaryAdjustedSum += currPrimaryPiece["adjustedVal"];

      if(greenSet.has(currPrimaryPiece.key) || exclude.has(currPrimaryPiece)) {
        if(currSubset["adjustedDemand"] >= 100 && currPrimaryPiece["adjustedVal"] - currPrimaryPiece["baseVal"] < -10) {
          d3.select("#error-message").style("display", "contents");
          throw new Error("Unelectrifiable or green primary piece " + currPrimaryPiece.key + " mistakenly electrified in " + currSubset.key);
        }
      }
    }

    if(Math.abs(currPrimaryBaseSum - currPrimary["baseVal"]) > 10 ||
      Math.abs(currPrimaryAdjustedSum - currPrimary["adjustedVal"]) > 10) {
      d3.select("#error-message").style("display", "contents");
      throw new Error("Primaries don't sum up in " + currSubset.key); 
    }
    if(Math.abs(currTotal["baseVal"] - currElectric["baseVal"] - currPrimary["baseVal"]) > 10 ||
      Math.abs(currTotal["adjustedVal"] - currElectric["adjustedVal"] - currPrimary["adjustedVal"]) > 10) {
      d3.select("#error-message").style("display", "contents");
      throw new Error("Electric and primary, base or adjusted, don't sum up to total in " + currSubset.key);
    }
    if(Math.abs(currSubset["adjustedElectrification"] - 100 * (currElectric["adjustedVal"] / currTotal["adjustedVal"]) > 1)) {
      d3.select("#error-message").style("display", "contents");
      throw new Error("Electrification % is incorrect in " + currSubset.key);
    }
    
    // the below is a different process from the toMove stuff in calculateStoreAdjustedVals() so that we can make sure it actually works from a different angle
    // but this means we also won't check toMove in the smaller pieces beyond checking unelectrifieds & sums above
    // in original calculation, we first scale demand then move electrification; here we first move electrification then scale demand

    // find change in electrification
    let currBaseElectrification = 100 * (currElectric["baseVal"]/currTotal["baseVal"]);
    let currElectrificationDiff = currSubset["adjustedElectrification"] - currBaseElectrification;
    // add/remove said electrification change between electricity & primary, to make correct electrification proportion
    let currProgressElectric = (currElectric["baseVal"] + (currElectrificationDiff) * (currElectric["baseVal"] / currBaseElectrification));
    let currProgressPrimary = (currPrimary["baseVal"] - (currElectrificationDiff) * (currPrimary["baseVal"] / (100 - currBaseElectrification)));
    // see how much percent of the base demand is filled by this new proportion, based on electric efficiency factor
    // aka, electric likely counts for more demand filled per GWh than primary does, since percent demand is based on amount of users, not raw energy
    // (thus the elec efficiency is tied in)
    let currProgressDemand = 100 * (currProgressElectric / currSubset["adjustedElecEfficiency"] + currProgressPrimary) /
      (currElectric["baseVal"] / currSubset["adjustedElecEfficiency"] + currPrimary["baseVal"]);
    // now multiply the vals by however much more is left to multiply by to reach correct adjusted demand
    // multiplier is the same because proportions stay the same, to get correct electrification
    let currExpectedElectric = currProgressElectric * (currSubset["adjustedDemand"] / currProgressDemand);
    let currExpectedPrimary = currProgressPrimary * (currSubset["adjustedDemand"] / currProgressDemand);

    if(Math.abs(currExpectedElectric - currElectric["adjustedVal"]) > 10) {
      d3.select("#error-message").style("display", "contents");
      throw new Error("Adjusted electric based on baseVal/adjustedDemand/adjustedElectrification is incorrect in " + currSubset.key);
    }
    if(Math.abs(currExpectedPrimary - currPrimary["adjustedVal"]) > 10) {
      d3.select("#error-message").style("display", "contents");
      throw new Error("Adjusted primary based on baseVal/adjustedDemand/adjustedElectrification is incorrect in " + currSubset.key);
    }
  }

  let currElectricBaseSum = 0;
  for(let currElectricityPiece of electricity.values()) {
    currElectricBaseSum += currElectricityPiece["baseVal"];
    if(Math.abs(elecBaseGeneration * currElectricityPiece["adjustedDemand"] / 100 - currElectricityPiece["adjustedVal"]) > 10) {
      d3.select("#error-message").style("display", "contents");
      throw new Error("Incorrect calculation of adjusted electricity generation as percentage of total base in " + currElectricityPiece.key);
    }
  }
  currElectricBaseSum += elecImport["baseVal"];
  currElectricBaseSum += elecOther["baseVal"];
  if(Math.abs(elecBaseGeneration - currElectricBaseSum) > 10) {
    d3.select("#error-message").style("display", "contents");
    throw new Error("Electric pieces' base values fail to sum to stored base sum");
  }

  for(let currCO2Subset of co2.map.values()) {
    for(let currCO2Piece of currCO2Subset.co2Pieces.values()) {
      if(currCO2Subset.key === "electric") {
        if(Math.abs(currCO2Piece["adjustedVal"] - electricity.get(currCO2Piece.key)["adjustedVal"] * currCO2Piece["factor"]) > 0.01) {
          d3.select("#error-message").style("display", "contents");
          throw new Error("CO2 factor multiplied by electricity adjusted val does not equal CO2 adjusted val for " + currCO2Piece.key);
        }
      } else {
        if(Math.abs(currCO2Piece["adjustedVal"] - consumption.get(currCO2Subset.key).subSubsets.get("primary").primaryPieces.get(currCO2Piece.key)["adjustedVal"] 
          * currCO2Piece["factor"]) > 0.01) {
          d3.select("#error-message").style("display", "contents");
          throw new Error("CO2 factor multiplied by " + currCO2Subset.key + " adjusted val does not equal CO2 adjusted val for " + currCO2Piece.key);
        }
      }
    }
  }
}

// -----------------------------------------------------
// ---Initial: ---
// -----------------------------------------------------
initialize();