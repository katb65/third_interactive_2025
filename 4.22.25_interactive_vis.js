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

class PrimaryPiece { // TODO
}

class SubSubset { // TODO 
}

class SectorSubset {
    key; // the sector type (ex. "commercial")

    // Maps of green & not green sub subset names, to IDs used to index into EIA and curr state vals for curr year for that ID
    // TODO ^ so it will be state only, not US?
    greenSubSubsets;
    nGreenSubSubsets; 
    
    // TODO maps + constructor
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