# interactive_electrification_2025

Interactive visualization using D3 (JavaScript) to allow variable electrification percentages and sources of electricity per state in the US, along with other micro-modifications, displaying resulting emissions.

HTML, JS (D3), and CSS work together to create the webpage which works in real-time off the EIA API. Multiple subsections of the EIA API are pulled from, meaning formatting of the calls differs slightly, but the fetch time and abstraction of the inner functions is nonetheless optimized. Consequences of any user interaction spread throughout the visualization's subparts, and certain interactive elements can be hidden or displayed in advanced settings. The grid of sectors cross-updates max value of the 4 graphs to be equal whenever values are increased or decreased past a threshold. Electrification slider automatically slides back down to max out without electrifying green primary energy production; or aviation & marine for the transportation sector, if switched on. Graphs & legend update based on green/not green switches. Legend formatted for minimal clutter while displaying all available data for cases where tooltip is inconvenient. Tooltips for all graphs. Function to verify inner validity.

Encompasses elements of both the prior electricity generation visualization and the prior energy demand visualization.

<img width="1896" height="901" alt="image" src="https://github.com/user-attachments/assets/246b32da-2697-4f0f-a19d-46979b5ae710" />

<img width="1893" height="898" alt="image" src="https://github.com/user-attachments/assets/3e390634-befe-440c-aff3-b5894642a046" />

<img width="1890" height="904" alt="image" src="https://github.com/user-attachments/assets/a61256f1-d187-4c50-a991-b6e23a29fc1b" />

<img width="1885" height="905" alt="image" src="https://github.com/user-attachments/assets/18ee3ab6-bd38-4932-b342-c36688b0671a" />



