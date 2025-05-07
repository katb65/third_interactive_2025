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
    idToVal; // map to contain ID to val to add or subtract for state mappings for this piece, GWh
    // needs to be a map due to some pieces having multiple different things that need to be added or subtracted
    val; // totaled val state of this piece, GWh
  
    // add means add together, sub means subtract from these, all to get final total for primary
    // b/c some vals come with caveats (ex. natural gas needs supplemental fuels subtracted)
    constructor(key, idsEnergyAdd, idsEnergySub) {
      this.idToVal = new Map();
  
      this.key = key;
      for(let id of idsEnergyAdd) {
        this.idToVal.set(id, {val: null, add: true});
      }
      for(let id of idsEnergySub) {
        this.idToVal.set(id, {val: null, add: false});
      }
  
      this.val = null;
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
    val; // GWh

    primaryPieces; // only non-null in primary SubSubsets, contains breakdown of primary energy by map of id to energy from that id, values in GWh
    // and another ID & value per primary piece that stores CO2 for that primary piece + how to access it
    // (technically we could split electric data too, for both energy & CO2, but the focus here is more on the primary parts)

    constructor(key, idEnergy) {
        this.key = key;
        this.idEnergy = idEnergy;
        this.val = null;
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

    // Maps of sub subset names, to IDs used to index into EIA and curr state vals for curr year for that ID
    subSubsets; 

    constructor(key, idElectric, idTotal, 
        idWind, idSolar, idGeo, idHydro,
        idCoal, idNatGas, idSuppGas, idPetroleum) {

        this.key = key;

        this.subSubsets = new Map();
        this.subSubsets.set("electric", new SubSubset(key, "electric", idElectric)); // id for electric stored higher up due to need to divide
        this.subSubsets.set("primary", new SubSubset(key, "primary", null));
        this.subSubsets.set("total", new SubSubset(key, "total", idTotal)); 
    
        this.subSubsets.get("primary").setupPrimaryPieces(idWind, idSolar, idGeo, idHydro,
                                                            idCoal, idNatGas, idSuppGas, idPetroleum);
    }

    // TODO will CO2 be integrated here or be its own object?
}

// TODO CONCEPT:
// base sector data and adjusted sector data in separate objects (both here not in display vars since it's moreso stored data than display variance even if user-input)
// allows button for quick reset to base. allows recombination of pieces into diff amounts of bars (ex. once aviation exclusion etc exists) 
// and subcontents of bars for display without compromising base data but with having stable objects to map in d3 so that the data joining is not reprocessed on 
// every slider slide. allows a place to store % electrification and amount of demand that isn't intertwined w base data.
// okay... why would we have separate objects for each section. let's just rework the object, no??
/*
map(key->sector subset)

sector subset [
    key

    (though we can calculate these from base, it's nice to have them handy for easy reset):
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
    idToVal (id->{val, add/subtract})

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







/*

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

// TODO the containers of the helper objects

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

// -----------------------------------------------------
// ---On-Change Functions: ---
// -----------------------------------------------------

// Called on user change of state selection, changes state variable then 
// locks user input, updates inner data & its text & vis output, unlocks user input
async function updateState() {
    /*
    state = d3.select("#state-select-drop").property("value");

    disableUserInput();

    await pullStoreStateData();

    visualizeStateData(); 

    enableUserInput();
    */
}

// Called on user change of year selection, changes year variable then
// locks user input, updates inner data & its text & vis output, unlocks user input
async function updateYear() {
    /*
    year = parseInt(d3.select("#year-select-drop").property("value"));

    disableUserInput();

    await pullStoreUSData();
    if(state === "US") {
      copyUSToStateData();
    } else {
      await pullStoreStateData();
    }

    visualizeStateData();

    enableUserInput();
    */
}

// Called on user change of GW vs GWh display selection, changes GWhorGW and updates text output
function updateGWhorGW() {
    /*
  GWhorGW = d3.select("#GWh-or-GW-drop").property("value");

  visualizeStateData();
  */
}

// -----------------------------------------------------
// ---Main Functions: ---
// -----------------------------------------------------

// Sets up year dropdown + state-specific and US-wide variables & text through initial data pull & unlocks the user input
// NOTE: assumes user input is locked in the process
async function initialize() {
    // Pull everything for US to initialize
    initializeStateNameToID();
    initializeStateSelect();

    /*
    await initializeYears();

    await pullStoreUSData();
    if(state === "US") {
      copyUSToStateData();
    } else {
      await pullStoreStateData();
    }

    visualizeStateData();

    enableUserInput();
    */
}

// Generate user input dropdown for state selection based on our state name -> state ID mapping
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
}

function checkTotalParts() { // TODO
}

// -----------------------------------------------------
// ---Initial: ---
// -----------------------------------------------------
initialize();