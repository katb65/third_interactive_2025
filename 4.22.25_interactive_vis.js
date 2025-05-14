// ---Goal: ---
// TODO

// ---Assumptions: ---
// TODO

// ---These should be changed to someone else's EIA API key & directory root (for local files) once I'm not involved with the project: ---
// (key obtainable on EIA site):
let eiaKey = "QL5ASXTSN9ccXzVu4Ly6UKwc0Fkj4AyKuDVs1dEX";
let directoryRoot = ""; // if this is blank, doesn't seem to trigger CORS due to same origin: 
// if using full root name, may need to update server CORS policy to allow

// -----------------------------------------------------
// ---Helper Objects: ---
// -----------------------------------------------------

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

// To aid in SectorSubset mapping mechanics, holds one of the pieces that a sector subset is divided into (its name, ids, and values for US & current-set state
// for current-set year)
// IDs may pull in different units than stored; are converted in pull method if so
// A sector subset is divided into 3 main pieces: elecSector, primary, and total, where elecSector + primary = total,
// electric = electricity this sector consumes from the electric sector (post-production losses, not inc them - ex. coal's inefficiency disregarded)
// primary = total primary energy this sector consumes (not from elecSector)
// total = this sector's total consumption (for the set year, not inc. "electrical system energy losses") = electric + primary
// primary energy SubSubsets are further divided using inner map
// null or 0 for any value means not present in EIA data (assumed 0)
class SubSubset { // TODO; primary with maps of green and not green primary pieces! actually nvm: define these in display vars - so that pulled items stay static?
    // no but they won't stay static anyway since user adjustment will slide them & it doesn't make sense for this use case to have them static and user adjusted
    // add-on values separate, so just adjust straight within them - actually, how to make this more dynamic? can't redraw whole vis on every slider, need
    // direct way to map vals to rectangles. make a functional barebones vers for now then adjust to make object directly usable. OH but if I have it separate
    // I can have a "reset" button; and then there will be a hard line between real and created data?

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
// Its own mapping key is stored inside again since the object needs to be independently functional (like for treemap display)
class SectorSubset {
    key; // the sector type (ex. "commercial")

    // TODO: should I move all the IDs, values (base/adjusted) from total into here + adjust pull & stores? will make it cleaner as demand/electrification
    // is now a value that has to be stored here so it's no longer a valueless container. may not be worth with time tradeoff currently though.
    // also here stored are %s whereas that is actual vals

    // Base demand can be found in the "total" subSubset baseVal; 
    // Base electrification can be calculated by a combination of electric subSubset's baseVal, primary subSubset's baseVal, and the efficiency factor 
    // to level electric to a "user-count" sort of demand scale rather than "GWh-count", since primary often uses more energy to accomplish the same 
    // task as electricity does

    elecEfficiency; // for this sector, proportion of electricity needed to primary energy to accomplish same tasks (due to certain heat/power savings)

    // The values the user has moved to on the sliders for this sector
    adjustedDemand; // % of base demand (since GWh will vary by electrification due to efficiency factors)
    adjustedElectrification; // % of adjustedDemand electrified (with efficiency factor taken into account)

    // Maps of sub subset names, to IDs used to index into EIA and curr state vals for curr year for that ID
    subSubsets; 

    constructor(key, elecEfficiency, idElectric, idTotal, 
        idWind, idSolar, idGeo, idHydro,
        idCoal, idNatGas, idSuppGas, idPetroleum) {

        this.key = key;
        this.elecEfficiency = elecEfficiency;

        this.adjustedDemand = null;
        this.adjustedElectrification = null;

        this.subSubsets = new Map();
        this.subSubsets.set("electric", new SubSubset("electric", idElectric)); // id for electric stored higher up due to need to divide
        this.subSubsets.set("primary", new SubSubset("primary", null));
        this.subSubsets.set("total", new SubSubset("total", idTotal)); 
    
        this.subSubsets.get("primary").setupPrimaryPieces(idWind, idSolar, idGeo, idHydro,
                                                            idCoal, idNatGas, idSuppGas, idPetroleum);
    }

    // TODO will CO2 be integrated here or be its own object?
}

/*
map(key->sector subset)

sector subset [
    key

    (though we can calculate these from base, it's nice to have them handy for easy reset/object layout consistency):
    baseDemand
    baseElectrification

    sub subsets (electric, primary, total: will exist for both base and adjusted sector data)

    adjustedDemand
    adjustedElectrification
]

sub subset [ 
    key
    id

    baseVal
    
    primary pieces (for primary)

    adjustedVal
]

primary piece [
    key
    idToVal (id->{baseVal, add/subtract})

    baseVal

    adjustedVal (this will start out being adjusted through parent percentages only (this base val / parent base val being the init ratio), 
    but become individually adjustable as a checkbox option? ex. coal in industry.)
]


okay now how to split these primaries into green, ngreen, and unelectrifiable, w consistent object modeling to quickly rerun d3 mappings?
when user elects to use unelectrifiables, we just rewire the primary pieces to add several new ones for aviation/marine, and subtract out their vals from
the id subtract pieces of the overarching petroleum or whatever it is. vice versa if they unselect that checkbox.
we always store the primary pieces in their bulk big map. separately in display vars, we have our bar graph mappings, to primary piece keys:
green->solar, wind, ... ngreen->coal, gas,... nuclear? depends! what did they choose?, ... unelectrifiable->depends if this even exists! aviation, cargoships,...
the demand/electrification% will not need to jump around when a piece switches bar categories, since ofc it totals to the same; so that part is fine.
however! the green primaries need not be electrified. so if they say nuclear is ngreen, slide electrification to 100%, then say actually nuclear is green,
they will now need LESS electricity; and i guess demand will also change? no it won't bc the way the slider will be set up will be to dual the if 100% electrified/
if 100% nonelectrified vals on top/bottom. no but those vals will need to change bc the amount of the thing (nongreen primaries) that is being electrified, changes.
TODO:
okay so the thing that happens when they switch something like this is: the system adjusts electrification% and checks if it has overflowed: if it has,
the system adjusts it back to 100%, and removes that need-for-electricity from the bottom electrification spot (simple way: just have a blurb that says "you have
x gwh more electricity than required!/you need x gwh more electricity to fulfill demand!")
TODO: 
try and make sure that when we bind the data, we bind it somehow in a key-matching-way, so the system does not redraw data it already has ..? or will it be
out of order, then, if things get slid around...


*/

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

// Store CO2 IDs that are repeatedly used (TODO: use or put in other obj) outside + overall ids and values map (map inside is subset key -> FuelSubset object)
// IDs pull energy in Billion BTU, need conversion (CO2 emissions have correct unit)
// (CO2 ID storing outside makes them harder to store when pulling but gives less redundancy during query formulation)
let sectorsCons = {idAllFuelCO2: "TO", idElecSectorCO2: "EC", idCoalCO2: "CO", idNatGasCO2: "NG", idPetroleumCO2: "PE", subsetsMap: new Map()};

// using end-use, not net, for total (net was too small, primary parts overflowed); so we can't pull primary (similar process subtractions in it as in net), 
// we must subtract electric to get it
// TODO change the factors from 0.8 to be accurate ones
sectorsCons.subsetsMap.set("residential", new SectorSubset("residential", 0.8, "ESRCB", "TNRCB",
                                                  null, "SORCB", "GERCB", null,
                                                  "CLRCB", "NGRCB", "SFRCB", "PARCB")); // TODO CO2? "RC"
sectorsCons.subsetsMap.set("commercial", new SectorSubset("commercial", 0.8, "ESCCB", "TNCCB",
                                                "WYCCB", "SOCCB", "GECCB", "HYCCB",
                                                "CLCCB", "NGCCB", "SFCCB", "PACCB")); // TODO CO2 "CC"
// the ID is slightly different for industrial electricity than the others: it's "excluding refinery use" - hence "ESISB", not "ESICB" (the latter doesn't add up)
sectorsCons.subsetsMap.set("industrial", new SectorSubset("industrial", 0.8, "ESISB", "TNICB",
                                                "WYICB", "SOICB", "GEICB", "HYICB",
                                                "CLICB", "NGICB", "SFINB", "PAICB")); // TODO CO2 "IC"
// NGASB not NGACB for transportation's natural gas (there's no supplemental fuels to subtract out by ID here)
sectorsCons.subsetsMap.set("transportation", new SectorSubset("transportation", 0.8, "ESACB", "TNACB",
                                                    null, null, null, null,
                                                    "CLACB", "NGASB", null, "PAACB")); // TODO CO2 "TC"

// -----------------------------------------------------
// ---Display Variables: ---
// -----------------------------------------------------

// To add commas to delimit 000 in numbers and keep the 2 decimal points
let formatCommas = d3.format(",.2f");

// Whether to display energy data in GW or GWh (one is more intuitive to renewable energy formats, the other to
// consumable energy formats; adjusted with user's selection)
let GWhorGW = "GWh";

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

d3.selectAll(".cell > * > .slider")
    .on("change", (event) => updateSectorSlider(event));

// -----------------------------------------------------
// ---On-Change Functions: ---
// -----------------------------------------------------

// Called on user change of state selection, changes state variable then 
// locks user input, updates inner data & its text & vis output, unlocks user input
async function updateState() {
  state = d3.select("#state-select-drop").property("value");

  disableUserInput();

  await pullStoreData();

  // TODO move into vis func
  d3.selectAll(".cell")
  .each(function(d,i) {
      console.log("test");

      let currSectorBox = d3.select(this);
      let currSector = currSectorBox.attr("class").split(" ")
          .find((element) => /sector-/.test(element)).slice(7);

      let currAdjustedElectrification = sectorsCons.subsetsMap.get(currSector).adjustedElectrification;

      currSectorBox.select(".type-electrification > .slider").property("value", currAdjustedElectrification);
      currSectorBox.select(".type-electrification > .slider-output").text(currAdjustedElectrification + "%");
  });

  enableUserInput();

    /*
    visualizeStateData(); 
    */
}

// Called on user change of year selection, changes year variable then
// locks user input, updates inner data & its text & vis output, unlocks user input
async function updateYear() {
  year = parseInt(d3.select("#year-select-drop").property("value"));

  disableUserInput();

  await pullStoreData();

  // TODO move into vis func
  d3.selectAll(".cell")
  .each(function(d,i) {
      console.log("test");

      let currSectorBox = d3.select(this);
      let currSector = currSectorBox.attr("class").split(" ")
          .find((element) => /sector-/.test(element)).slice(7);

      let currAdjustedElectrification = sectorsCons.subsetsMap.get(currSector).adjustedElectrification;

      currSectorBox.select(".type-electrification > .slider").property("value", currAdjustedElectrification);
      currSectorBox.select(".type-electrification > .slider-output").text(currAdjustedElectrification + "%");
  });

  enableUserInput();

    /*

    visualizeStateData();
    */
}

// Called on user change of GW vs GWh display selection, changes GWhorGW and updates text output
function updateGWhorGW() {
  //TODO
    /*
  GWhorGW = d3.select("#GWh-or-GW-drop").property("value");

  visualizeStateData();
  */
}

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

    console.log(currSector);
    console.log(currType);

    // store data + all the primary pieces within this sector must now be proportionally adjusted to this new demand/electrification
    // TODO switched from adjusted-based to base-based but completely forgot to take into account adjusted elec in the demand if and adjusted demand in the elec if. 
    // Probably best done instead by doing one big flat thing outside the if for both adjustments, basing it on base values as I already am, taking both adjusteds
    // into the makeup of it.
    let currSubset = sectorsCons.subsetsMap.get(currSector);
    if(currType === "demand") {
      currSubset["adjustedDemand"] = currValue;

      currSubset.subSubsets.get("primary")["adjustedVal"] = (currValue / 100) * currSubset.subSubsets.get("primary")["baseVal"];
      currSubset.subSubsets.get("electric")["adjustedVal"] = (currValue / 100) * currSubset.subSubsets.get("electric")["baseVal"];
      currSubset.subSubsets.get("total")["adjustedVal"] = currSubset.subSubsets.get("primary")["adjustedVal"] + currSubset.subSubsets.get("electric")["adjustedVal"];

      // primary pieces
      for(let currPrimaryPiece of currSubset.subSubsets.get("primary").primaryPieces.values()) {
        currPrimaryPiece["adjustedVal"] = (currValue / 100) * currPrimaryPiece["baseVal"];
      }

    } else if(currType === "electrification") {
      // so if electrification increases, the primary vals go down, proportional to their percentage of the total primary val, and the electric val goes up,
      // and total stays the same no it doesn't because of the electric factor stuff it goes down
      currSubset["adjustedElectrification"] = currValue;

      // currToMove = the amount of primary GWh that needs to be either subtracted or added with respect to baseVal; the electric GWh to be subtracted/added will 
      // be inverse, and multiplied by the corresponding efficiency factor
      // this could be simpler based on adjustedVal/prior adjustedElectrification, but it would run away from the base vals with continual adjustments if so
      // due to rounding
      let baseElectrification = ((currSubset.subSubsets.get("electric")["baseVal"]/(currSubset.elecEfficiency)) / 
        ((currSubset.subSubsets.get("primary")["baseVal"]) + (currSubset.subSubsets.get("electric")["baseVal"]/(currSubset.elecEfficiency)))) * 100;
      let currToMove = (currSubset.subSubsets.get("primary")["baseVal"] / (100 - baseElectrification)) * (baseElectrification - currValue);

      currSubset.subSubsets.get("primary")["adjustedVal"] = currSubset.subSubsets.get("primary")["baseVal"] + currToMove;
      currSubset.subSubsets.get("electric")["adjustedVal"] = currSubset.subSubsets.get("electric")["baseVal"] - (currToMove * currSubset.elecEfficiency);
      currSubset.subSubsets.get("total")["adjustedVal"] = currSubset.subSubsets.get("primary")["adjustedVal"] + currSubset.subSubsets.get("electric")["adjustedVal"];

      // primary pieces, by ratio
      for(let currPrimaryPiece of currSubset.subSubsets.get("primary").primaryPieces.values()) {
        currPrimaryPiece["adjustedVal"] = currPrimaryPiece["baseVal"] + currToMove * (currPrimaryPiece["baseVal"] / currSubset.subSubsets.get("primary")["baseVal"]);
      }
    }

    // Store event consequences
    // TODO more or is it just the above?

    // Print event update
    // TODO more
    currSliderBox.select(".slider-output").text(currValue + "%")
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

    // TODO move this to some other print/vis data func (as below)
    d3.selectAll(".cell")
        .each(function(d,i) {
            console.log("test");

            let currSectorBox = d3.select(this);
            let currSector = currSectorBox.attr("class").split(" ")
                .find((element) => /sector-/.test(element)).slice(7);

            let currAdjustedElectrification = sectorsCons.subsetsMap.get(currSector).adjustedElectrification;

            currSectorBox.select(".type-electrification > .slider").property("value", currAdjustedElectrification);
            currSectorBox.select(".type-electrification > .slider-output").text(currAdjustedElectrification + "%");
        });
    /*

    visualizeStateData();

    */

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
    let years = [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022];

    // initialize the HTML element with available years
    let yearSelectDrop = d3.select("#year-select-drop");

    yearSelectDrop.selectAll("option")
    .data(years)
    .join("option")
    .property("value", d=>d)
    .text(d=>d);

    year = years[0]; // will be latest year, due to sorting of request & JavaScript map key ordering mechanics
    // TODO ^ WILL be latest year once I pull them

    // TODO make this actually pull years info (combining the two vis's data sources to cross ref all avail years)
}

// Acquire per-sector fuel consumption info for current-set state and year and store in the SectorSubsets
// NOTE: assumes user input is locked in the process; and does not unlock it (needs an outer layer function to do so)
async function pullStoreData() {
    // pull entire API call at once per EIA browser type, then go through values and sift them into the corresponding object spaces
    // then check that it approx. sums to total for each one, and throw error if not
  
    // query for query strings & await Promise resolution
    let allFullsEnergyPromise = d3.json(composeQueryString("energy", "value", state, (year-1), (year+1)));
    //let allFullsCO2Promise = d3.json(composeQueryString("CO2", "value", state, (year-1), (year+1)));
    let allFullsEnergy = await allFullsEnergyPromise;
    //let allFullsCO2 = await allFullsCO2Promise;
  
    storeSectorData(allFullsEnergy); // TODO later pass allFullsCO2 to store also - and presumably electricity breakdown as well
  
    //checkTotalParts();
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

// For updateState(), updateYear(), TODO
// Disables all user input elements
function disableUserInput() {
    d3.select("#state-select-drop")
        .property("disabled", true);
    d3.select("#year-select-drop")
        .property("disabled", true);
    d3.select("#GWh-or-GW-drop")
        .property("disabled", true);
    d3.selectAll(".cell > * > .slider")
        .property("disabled", true);
}

// For initialize(), updateState(), updateYear(), TODO
// Enables all user input elements
function enableUserInput() {
    d3.select("#state-select-drop")
        .attr("disabled", null);
    d3.select("#year-select-drop")
        .attr("disabled", null);
    d3.select("#GWh-or-GW-drop")
        .attr("disabled", null);
    d3.selectAll(".cell > * > .slider")
        .attr("disabled", null);
}

// For initializeYears(), pullStoreData()
// Composes an EIA energy or CO2 data query string with optional query, stateId, start, and end dates, 
// with current EIA API key and instructions to return annually & sort returned data by date in descending order
// (primary pieces are skipped in case of null query - used for year initialization)
// TODO: make this compose for elec subparts (vis 1 stuff) as well
function composeQueryString(energyOrCO2, query, stateId, start, end) {
    let allQueryString = "";
  
    if(energyOrCO2 === "energy") {
      allQueryString = "https://api.eia.gov/v2/seds/data/?";
    } else {
      allQueryString = "https://api.eia.gov/v2/co2-emissions/co2-emissions-aggregates/data/?"
    }
  
    allQueryString = allQueryString + "api_key=" + eiaKey + "&frequency=annual" + 
      "&sort[0][column]=period&sort[0][direction]=desc&offset=0";
  
    if(query !== null) {
      allQueryString += ("&data[0]=" + query);
    }
    if(stateId !== null) {
      allQueryString += ("&facets[stateId][]=" + stateId);
    }
    if(start !== null) {
      allQueryString += ("&start=" + start);
    }
    if(end !== null) {
      allQueryString += ("&end=" + end);
    }
  
    // add every ID we need to query for to the string
    if(energyOrCO2 === "energy") {
      for(let currSubset of sectorsCons.subsetsMap.values()) {
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
        }
      }
    } else {
      allQueryString += ("&facets[fuelId][]=" + sectorsCons.idAllFuelCO2);
      allQueryString += ("&facets[sectorId][]=" + sectorsCons.idElecSectorCO2);
  
      for(let currSubset of sectorsCons.subsetsMap.values()) {
        allQueryString += ("&facets[sectorId][]=" + currSubset.subSubsets.get("primary").idSectorCO2);
      }
  
      if(query !== null) {
        allQueryString += ("&facets[fuelId][]=" + sectorsCons.idCoalCO2);
        allQueryString += ("&facets[fuelId][]=" + sectorsCons.idNatGasCO2);
        allQueryString += ("&facets[fuelId][]=" + sectorsCons.idPetroleumCO2);
      }
    }

    console.log(allQueryString);
  
    return allQueryString;
}

// For pullStoreData()
// Dissects & stores EIA API response data for in the values map for the current-set year & state
// If no data for some value, assumes it 0
function storeSectorData(allFullsEnergy) {  
    console.log(allFullsEnergy);
    // Set all vals as 0 to avoid leftover prior values in case of data gaps
    for(let currSubset of sectorsCons.subsetsMap.values()) {
        currSubset["adjustedDemand"] = 0;
        currSubset["adjustedElectrification"] = 0;

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
  
    // isolate the requested values from the energy response & store them in the right spots
    for(let currFullEnergy of allFullsEnergy.response.data) {
      if(parseInt(currFullEnergy.period) != year) {
        continue; // we fetched several years near current year due to variable API mechanics, so cycle past irrelevant ones
      }
  
      if(currFullEnergy.unit !== "Billion Btu" || currFullEnergy.stateId !== state) { // year & series ID already checked above or below
        throw new Error("Unexpected unit or state ID mismatch in pulled API data with " + currFullEnergy);
      }
  
      let postConvert;
      if(isNaN(parseFloat(currFullEnergy.value))) {
        postConvert = 0;
      } else {
        // convert response val from Billion Btu to GWh
        let preConvert = parseFloat(currFullEnergy.value);
        postConvert = preConvert * (1/3.412);
        console.log(postConvert);
      }
  
      for(let currSubset of sectorsCons.subsetsMap.values()) {
        for(let currSubSubset of currSubset.subSubsets.values()) {
          if(currSubSubset.idEnergy === currFullEnergy.seriesId) {
            // store converted val in currSubSubset
            currSubSubset["baseVal"] = postConvert;
          } else if(currSubSubset.key === "primary") { // or it might be an ID for one of the primary pieces
            for(let currPrimaryPiece of currSubSubset.primaryPieces.values()) {
              for(let currID of currPrimaryPiece.idToVal.keys()) {
                if(currID === currFullEnergy.seriesId) {
                  currPrimaryPiece.idToVal.get(currID)["baseVal"] = postConvert;
                }
              }
            }
          }
        }
      }
    }
  
    /*
    // isolate the requested values from the CO2 response & store them in the right spots
    for(let currFullCO2 of allFullsCO2.response.data) {
      if(parseInt(currFullCO2.period) != year) {
        continue; // we fetched several years near current year due to variable API mechanics, so cycle past irrelevant ones
      }
  
      if(currFullCO2["value-units"] !== "million metric tons of CO2" || currFullCO2.stateId !== stateId) { // year & sector ID already checked
        throw new Error("Unexpected unit or state ID mismatch in pulled API data with " + currFullCO2 + " units " + currFullCO2["value-units"]);
      }
  
      if(currFullCO2.sectorId === sectorsCons.idElecSectorCO2 && currFullCO2.fuelId === sectorsCons.idAllFuelCO2) {
        // if this is the electric sector val, it needs to be split proportionally & stored in all the elecSector sub-subsets in pieces
  
        let postConvert;
        if(isNaN(parseFloat(currFullCO2.value))) {
          postConvert = 0;
        } else {
          // read in response val
          postConvert = parseFloat(currFullCO2.value);
        }
  
        let residentialElec = sectorsCons.subsetsMap.get("residential").subSubsets.get("elecSector");
        let commercialElec = sectorsCons.subsetsMap.get("commercial").subSubsets.get("elecSector");
        let industrialElec = sectorsCons.subsetsMap.get("industrial").subSubsets.get("elecSector");
        let transportationElec = sectorsCons.subsetsMap.get("transportation").subSubsets.get("elecSector");
        
        if(stateOrUS === "state") {
          let electricTotal = commercialElec.valState + industrialElec.valState + transportationElec.valState + residentialElec.valState;
  
          residentialElec.co2State = postConvert * (residentialElec.valState/electricTotal);
          commercialElec.co2State = postConvert * (commercialElec.valState/electricTotal);
          industrialElec.co2State = postConvert * (industrialElec.valState/electricTotal);
          transportationElec.co2State = postConvert * (transportationElec.valState/electricTotal);
        } else {
          let electricTotal = commercialElec.valUS + industrialElec.valUS + transportationElec.valUS + residentialElec.valUS;
  
          residentialElec.co2US = postConvert * (residentialElec.valUS/electricTotal);
          commercialElec.co2US = postConvert * (commercialElec.valUS/electricTotal);
          industrialElec.co2US = postConvert * (industrialElec.valUS/electricTotal);
          transportationElec.co2US = postConvert * (transportationElec.valUS/electricTotal);
        }
      } else { // not EC, so a primary sector's val or primary piece val, find the corresponding sector & its primary sub subset or that sub subset's correct piece
        for(let currSubset of sectorsCons.subsetsMap.values()) {
          for(let currSubSubset of currSubset.subSubsets.values()) {
            if(currSubSubset.idSectorCO2 === currFullCO2.sectorId) {
  
              let postConvert;
              if(isNaN(parseFloat(currFullCO2.value))) {
                postConvert = 0;
              } else {
                postConvert = parseFloat(currFullCO2.value);
              }
  
              if(currFullCO2.fuelId === sectorsCons.idAllFuelCO2) { // CO2 of all fuels for this sector  
                // store read-in val in currSubSubset
                currSubSubset[accessCO2] = postConvert;
              } else { // CO2 of some primary piece of fuel for this sector
                if(currFullCO2.fuelId === sectorsCons.idCoalCO2) {
                  currSubSubset.primaryPieces.get("coal")[accessCO2] = postConvert;
                } else if (currFullCO2.fuelId === sectorsCons.idNatGasCO2) {
                  currSubSubset.primaryPieces.get("natural gas")[accessCO2] = postConvert;
                } else if (currFullCO2.fuelId === sectorsCons.idPetroleumCO2) {
                  currSubSubset.primaryPieces.get("petroleum")[accessCO2] = postConvert;
                }
              }
            }
          }
        }
      }
    }
      */
  
    // sum and store the CO2 totals per sector as well (not directly pullable due to our proportioning of electric sector) (TODO)
    // & derive the primary values and primary pieces inner totals,"other" (leftover of what was pulled), and electrification %
    // & set adjusted pieces to start at base
    for(let currSubset of sectorsCons.subsetsMap.values()) {
        /*
      currSubset.subSubsets.get("total")[accessCO2] = currSubset.subSubsets.get("elecSector")[accessCO2] + currSubset.subSubsets.get("primary")[accessCO2];
      */
  
      let currPrimary = currSubset.subSubsets.get("primary");
      currPrimary["baseVal"] = currSubset.subSubsets.get("total")["baseVal"] - currSubset.subSubsets.get("electric")["baseVal"]; // calculate primary
      currPrimary.primaryPieces.get("other")["baseVal"] = currPrimary["baseVal"]; // start other's val with primary total val
      for(let currPrimaryPiece of currPrimary.primaryPieces.values()) {
        // baseVal was set to 0 at start of function
        for(let currVal of currPrimaryPiece.idToVal.values()) {
          if(currVal.add) { 
            currPrimaryPiece["baseVal"] += currVal["baseVal"];
          } else {
            currPrimaryPiece["baseVal"] -= currVal["baseVal"];
          }
        }
  
        if(currPrimaryPiece.key !== "other") {
          currPrimary.primaryPieces.get("other")["baseVal"] -= currPrimaryPiece["baseVal"];
        }

        currPrimaryPiece["adjustedVal"] = currPrimaryPiece["baseVal"];
      }

      currSubset.subSubsets.get("total")["adjustedVal"] = currSubset.subSubsets.get("total")["baseVal"];
      currSubset.subSubsets.get("primary")["adjustedVal"] = currSubset.subSubsets.get("primary")["baseVal"];
      currSubset.subSubsets.get("electric")["adjustedVal"] = currSubset.subSubsets.get("electric")["baseVal"];

      currSubset["adjustedElectrification"] = (currSubset.subSubsets.get("electric")["baseVal"]/(currSubset.elecEfficiency)) / 
        ((currSubset.subSubsets.get("primary")["baseVal"]) + (currSubset.subSubsets.get("electric")["baseVal"]/(currSubset.elecEfficiency)));

      currSubset["adjustedDemand"] = currSubset.subSubsets.get("total")["baseVal"];
      console.log("ELEC EFF " + currSubset.elecEfficiency);
      currSubset["adjustedElectrification"] = ((currSubset.subSubsets.get("electric")["baseVal"]/(currSubset.elecEfficiency)) / 
        ((currSubset.subSubsets.get("primary")["baseVal"]) + (currSubset.subSubsets.get("electric")["baseVal"]/(currSubset.elecEfficiency)))) * 100;
    }
}

function checkTotalParts() { // TODO
}

// -----------------------------------------------------
// ---Initial: ---
// -----------------------------------------------------
initialize();