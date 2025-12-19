# **App Name**: Mirinha's Tracker

## Core Features:

- Item Input: Text field for entering item names. Recognizes and assigns prices automatically (PP, P, M, G, GG, KITM, KITG, PF).
- Intelligent Item Grouping: Automatically categorizes items into 'Fiados salão' (starts with 'F'), 'Fiados rua' (starts with 'Fr'), 'Vendas rua' (starts with 'R'), or 'Vendas salão' (all other items).
- Intelligent Price Parsing: If a user types 'M' or 'F'/'Fr'/'R' followed by a number, the app should interpret the value after as the custom price of the item, after stripping the text from it using an LLM tool
- Quantity Input: Optional field for item quantity (defaults to 1 if blank).
- Real-Time Reporting: Displays live data including item counts, total items, total prices, and values per item, and also tracks 'EXTRAS' separately.
- Final Report Generation: Creates a simplified final report with totals for each group ('Fiados salão', 'Fiados rua', 'Vendas rua', 'Vendas salão').
- Data Persistence: Data is saved and restored upon app restart. (using localStorage API)

## Style Guidelines:

- Background color: Dark gray (#212121) for contrast.
- Primary color: Vibrant red (#FF4500), mirroring the user request, for titles and important elements.
- Accent color: Pale red (#FFB3A7) to highlight interactive elements.
- Body and headline font: 'Inter', a sans-serif font with a modern, neutral appearance suitable for UI and report elements.
- Note: currently only Google Fonts are supported.
- Clear sections for item input, item list, and dynamic reports. 'Fiados' items displayed in red.