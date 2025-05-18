# Data Explorer Dashboard

This dashboard allows you to upload any flat JSON file and instantly explore your data with four interactive D3.js visualizations:

- **Radial Bar Chart**: Displays categorical data in a circular layout
- **Chord Diagram**: Shows relationships and flows between categories
- **Force-Directed Graph**: Visualizes network relationships and connections
- **Sunburst Chart**: Hierarchical data exploration with drill-down capability

## Features

### Data Handling
- **Generalized**: Works with any flat JSON dataset (no hardcoded field names)
- **Automated**: Extracts attributes and auto-selects dimensions for each chart
- **Smart Processing**: Automatically detects categorical and numerical fields
- **Data Validation**: Ensures data integrity and provides helpful error messages

### Interactive Features
- **Zoom & Pan**: All visualizations support zooming and panning
- **Selection**: Click or drag to select items across visualizations
- **Tooltips**: Detailed information on hover
- **Fullscreen Mode**: Toggle fullscreen view for each visualization
- **Legend**: Interactive legends with search functionality
- **Responsive**: Adapts to window size and screen orientation

### Visualization Capabilities
- **Radial Bar Chart**
  - Circular layout for categorical data
  - Value-based scaling
  - Interactive tooltips with detailed statistics
  - Customizable color scheme

- **Chord Diagram**
  - Relationship visualization between categories
  - Flow direction and magnitude representation
  - Percentage-based calculations
  - Interactive segment highlighting

- **Force-Directed Graph**
  - Network relationship visualization
  - Dynamic node positioning
  - Link strength representation
  - Node and edge highlighting

- **Sunburst Chart**
  - Hierarchical data exploration
  - Drill-down capability
  - Path-based navigation
  - Percentage and value calculations

### UI/UX Features
- **Modern Design**: Clean, responsive, and professional interface
- **Accessibility**: High contrast mode support
- **Keyboard Navigation**: Full keyboard support for all interactions
- **Responsive Layout**: Adapts to different screen sizes
- **No iframes**: All D3 visualizations are native and interactive

## How to Use
1. Open `index.html` in your browser (use a local server for best results)
2. Click "Choose File" and select your JSON file
3. Click "Load Data"
4. The dashboard will display a summary and all four visualizations
5. Interact with visualizations using:
   - Mouse: Click, drag, hover, scroll
   - Keyboard: Tab navigation, Enter/Space for selection
   - Buttons: Zoom in/out, reset view, fullscreen toggle

## Data Requirements
- The JSON file should be an array of objects (flat structure)
- Each object should have consistent fields
- Categorical fields (strings/booleans) and numerical fields (numbers) are auto-detected
- For best results, ensure your data has:
  - At least one categorical field
  - At least one numerical field
  - Consistent data types across fields

## File Structure
```
A3/
├── js/
│   ├── dashboard.js      # Main dashboard logic
│   ├── radial_bar.js     # Radial bar chart implementation
│   ├── chord.js          # Chord diagram implementation
│   ├── force_directed.js # Force-directed graph implementation
│   └── sunburst.js       # Sunburst chart implementation
├── index.html            # Main HTML file
├── style.css             # Styling and layout
└── README.md             # Documentation
```

## (Optional) Preprocessing for Nested JSON
If your JSON is nested, use the following Python script to flatten it:

```python
import json

def flatten(d, parent_key='', sep='_'):
    items = []
    for k, v in d.items():
        new_key = f'{parent_key}{sep}{k}' if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)

with open('input.json') as f:
    data = json.load(f)

flat_data = [flatten(row) for row in data]
with open('output_flat.json', 'w') as f:
    json.dump(flat_data, f, indent=2)
```

## Running Locally
For best results, run a local server:
```bash
python -m http.server 8000
```
Then open `http://localhost:8000/A3/index.html` in your browser.

## Browser Compatibility
- Chrome (recommended)
- Firefox
- Safari
- Edge
- Opera

## Performance Considerations
- Large datasets (>10,000 records) may impact performance
- Use the zoom and pan features to explore dense visualizations
- Consider preprocessing very large datasets before visualization 