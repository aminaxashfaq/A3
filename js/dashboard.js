const eventBus = new EventTarget();

function flattenObject(obj, parent = '', res = {}) {
    for (let key in obj) {
        if (!obj.hasOwnProperty(key)) continue;
        const propName = parent ? `${parent}_${key}` : key;
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            flattenObject(obj[key], propName, res);
        } else {
            res[propName] = obj[key];
        }
    }
    return res;
}

function showError(div, message) {
    if (!div) return;
    div.innerHTML = '';
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.setAttribute('role', 'alert');
    errorDiv.textContent = message;
    div.appendChild(errorDiv);
}

const state = {
    loadedData: null,
    loadedColumns: null,
    loadedCategorical: null,
    loadedNumerical: null,
    chordInstance: null,
    radialInstance: null,
    forceInstance: null,
    sunburstInstance: null,
    selectedItems: new Set(),
    colorScale: null
};

function detectDimensions(data) {
    if (!data || !data.length) return { categorical: [], numerical: [] };
    const columns = Object.keys(data[0]);
    const categorical = columns.filter(col =>
        data.every(d => d[col] === null || d[col] === undefined || typeof d[col] === 'string' || typeof d[col] === 'boolean')
    );
    const numerical = columns.filter(col =>
        data.every(d => d[col] === null || d[col] === undefined || (typeof d[col] === 'number' && !isNaN(d[col])))
    );
    return { categorical, numerical };
}

function createSharedColorScale(data, categoricalColumns) {
    const uniqueValues = [...new Set(data.flatMap(d => categoricalColumns.map(col => d[col])))].filter(v => v != null);
    return d3.scaleOrdinal()
        .domain(uniqueValues)
        .range(window.matchMedia('(prefers-contrast: high)').matches ? d3.schemeCategory10 : d3.schemeTableau10);
}

function renderSummary(data) {
    const summaryContent = document.getElementById('summary-content');
    if (!summaryContent || !data || !data.length) {
        if (summaryContent) showError(summaryContent, 'No data available');
        return;
    }

    const dimensions = detectDimensions(data);
    const createStatCard = (value, label) => `
        <div class="stat-card">
            <div class="stat-value">${value}</div>
            <div class="stat-label">${label}</div>
        </div>
    `;
    const createSummaryRow = (label, value) => `
        <div class="summary-row">
            <span class="summary-label">${label}:</span>
            <span class="summary-value">${value}</span>
        </div>
    `;
    const createListItem = field => `
        <div class="summary-list-item" title="${field}">
            ${field}
        </div>
    `;

    const statsHtml = `
        <div class="summary-stats">
            ${createStatCard(data.length, 'Total Rows')}
            ${createStatCard(Object.keys(data[0]).length, 'Total Columns')}
            ${createStatCard(dimensions.categorical.length, 'Categorical Fields')}
            ${createStatCard(dimensions.numerical.length, 'Numerical Fields')}
        </div>
    `;

    const fieldsHtml = `
        <div class="summary-section">
            <h3>📊 Dataset Fields</h3>
            ${createSummaryRow('Total Fields', Object.keys(data[0]).length)}
            ${createSummaryRow('Categorical', dimensions.categorical.length)}
            ${createSummaryRow('Numerical', dimensions.numerical.length)}
        </div>
    `;

    const categoricalHtml = `
        <div class="summary-section">
            <h3>🏷️ Categorical Fields</h3>
            <div class="summary-list">
                ${dimensions.categorical.length ? dimensions.categorical.map(createListItem).join('') : '<div>No categorical fields</div>'}
            </div>
        </div>
    `;

    const numericalHtml = `
        <div class="summary-section">
            <h3>📈 Numerical Fields</h3>
            <div class="summary-list">
                ${dimensions.numerical.length ? dimensions.numerical.map(createListItem).join('') : '<div>No numerical fields</div>'}
            </div>
        </div>
    `;

    summaryContent.innerHTML = `
        ${statsHtml}
        <div class="summary-grid">
            ${fieldsHtml}
            ${categoricalHtml}
            ${numericalHtml}
        </div>
    `;

    const dataSummary = document.getElementById('data-summary');
    if (dataSummary) dataSummary.style.display = 'block';
}

document.getElementById('loadData')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('jsonFile');
    const file = fileInput?.files[0];
    if (!file) {
        alert('Please select a JSON file.');
        return;
    }

    try {
        const text = await file.text();
        let rawData = JSON.parse(text);
        if (!Array.isArray(rawData)) rawData = [rawData];

        const allKeys = new Set();
        const data = rawData.map(row => {
            const flat = flattenObject(row);
            Object.keys(flat).forEach(k => allKeys.add(k));
            return flat;
        });

        if (!data.length) {
            alert('No valid data found in file.');
            return;
        }

        const columns = Array.from(allKeys);
        const dimensions = detectDimensions(data);
        state.colorScale = createSharedColorScale(data, dimensions.categorical);

        state.loadedData = data;
        state.loadedColumns = columns;
        state.loadedCategorical = dimensions.categorical;
        state.loadedNumerical = dimensions.numerical;
        state.chordInstance = null;
        state.radialInstance = null;
        state.forceInstance = null;
        state.sunburstInstance = null;
        state.selectedItems.clear();

        renderSummary(data);
        populateRadialSelectors(dimensions.categorical, dimensions.numerical);
        populateChordSelectors(dimensions.categorical, dimensions.numerical);
        populateForceSelectors(dimensions.categorical, dimensions.numerical);
        populateSunburstSelectors(dimensions.categorical, dimensions.numerical);

        const vizGrid = document.getElementById('visualization-grid');
        if (vizGrid) {
            vizGrid.style.display = 'grid';
            document.querySelectorAll('.chart').forEach(div => {
                div.innerHTML = '';
                const viz = div.closest('.visualization');
                const chartId = viz.id;
                const legendClass = `${chartId.replace('Chart', '').replace('Diagram', '').toLowerCase()}-legend-container`;
                if (!viz.querySelector(`.${legendClass}`)) {
                    const legendDiv = document.createElement('div');
                    legendDiv.className = legendClass;
                    viz.insertBefore(legendDiv, div);
                }
            });
        }

        initBrushing();

    } catch (error) {
        console.error('Error loading data:', error);
        alert(`Error loading data: ${error.message}`);
    }
});

function initBrushing() {
    eventBus.addEventListener('selection', (event) => {
        const { items, source } = event.detail;
        state.selectedItems.clear();
        items.forEach(item => state.selectedItems.add(item));

        if (state.radialInstance && source !== 'radial') {
            state.radialInstance.updateSelection(state.selectedItems);
        }
        if (state.chordInstance && source !== 'chord') {
            state.chordInstance.updateSelection(state.selectedItems);
        }
        if (state.forceInstance && source !== 'force') {
            state.forceInstance.updateSelection(state.selectedItems);
        }
        if (state.sunburstInstance && source !== 'sunburst') {
            state.sunburstInstance.updateSelection(state.selectedItems);
        }
    });
}

function fillSelect(select, options, multi = false) {
    if (!select) {
        console.warn('Select element not found');
        return;
    }
    select.innerHTML = '<option value="">Select an option</option>';
    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        select.appendChild(option);
    });
    if (multi) {
        select.setAttribute('multiple', 'multiple');
        select.value = '';
    } else {
        select.value = '';
    }
}

function populateRadialSelectors(categorical, numerical) {
    const categorySelect = document.getElementById('radial-category');
    const valueSelect = document.getElementById('radial-value');
    fillSelect(categorySelect, categorical);
    fillSelect(valueSelect, numerical);
    if (categorySelect) categorySelect.setAttribute('aria-label', 'Select radial chart category');
    if (valueSelect) valueSelect.setAttribute('aria-label', 'Select radial chart value');
}

function populateChordSelectors(categorical, numerical) {
    const sourceSelect = document.getElementById('chord-source');
    const targetSelect = document.getElementById('chord-target');
    const valueSelect = document.getElementById('chord-value');
    fillSelect(sourceSelect, categorical);
    fillSelect(targetSelect, categorical);
    fillSelect(valueSelect, numerical);
    if (sourceSelect) sourceSelect.setAttribute('aria-label', 'Select chord diagram source');
    if (targetSelect) targetSelect.setAttribute('aria-label', 'Select chord diagram target');
    if (valueSelect) valueSelect.setAttribute('aria-label', 'Select chord diagram value');
}

function populateForceSelectors(categorical, numerical) {
    const sourceSelect = document.getElementById('force-source');
    const targetSelect = document.getElementById('force-target');
    const valueSelect = document.getElementById('force-value');
    fillSelect(sourceSelect, categorical);
    fillSelect(targetSelect, categorical);
    fillSelect(valueSelect, numerical);
    if (sourceSelect) sourceSelect.setAttribute('aria-label', 'Select force-directed graph source');
    if (targetSelect) sourceSelect.setAttribute('aria-label', 'Select force-directed graph target');
    if (valueSelect) valueSelect.setAttribute('aria-label', 'Select force-directed graph value');
}

function populateSunburstSelectors(categorical, numerical) {
    const hierarchySelect = document.getElementById('sunburst-hierarchy');
    const valueSelect = document.getElementById('sunburst-value');
    fillSelect(hierarchySelect, categorical, true);
    fillSelect(valueSelect, numerical);
    if (hierarchySelect) hierarchySelect.setAttribute('aria-label', 'Select sunburst chart hierarchy fields');
    if (valueSelect) valueSelect.setAttribute('aria-label', 'Select sunburst chart value');
}

document.getElementById('generateRadialBtn')?.addEventListener('click', () => {
    if (!state.loadedData) {
        showError(document.querySelector('#radialBarChart .chart'), 'No data loaded');
        return;
    }
    const radialDiv = document.querySelector('#radialBarChart .chart');
    if (!radialDiv) {
        console.warn('Radial chart container not found');
        return;
    }
    radialDiv.innerHTML = '';

    const radialDims = {
        category: document.getElementById('radial-category')?.value,
        value: document.getElementById('radial-value')?.value
    };

    if (!radialDims.category || !radialDims.value) {
        showError(radialDiv, 'Please select both category and value');
        return;
    }
    if (!state.loadedCategorical.includes(radialDims.category)) {
        showError(radialDiv, 'Category must be a categorical field');
        return;
    }
    if (!state.loadedNumerical.includes(radialDims.value)) {
        showError(radialDiv, 'Value must be a numerical field');
        return;
    }

    try {
        state.radialInstance = new RadialBarChart(radialDiv, state.loadedData, radialDims, state.colorScale);
        state.radialInstance.updateSelection(state.selectedItems);
    } catch (error) {
        showError(radialDiv, `Error rendering radial chart: ${error.message}`);
    }
});

document.getElementById('generateChordBtn')?.addEventListener('click', () => {
    if (!state.loadedData) {
        showError(document.querySelector('#chordDiagram .chart'), 'No data loaded');
        return;
    }
    const chordDiv = document.querySelector('#chordDiagram .chart');
    if (!chordDiv) {
        console.warn('Chord chart container not found');
        return;
    }
    chordDiv.innerHTML = '';

    const chordDims = {
        source: document.getElementById('chord-source')?.value,
        target: document.getElementById('chord-target')?.value,
        value: document.getElementById('chord-value')?.value
    };

    if (!chordDims.source || !chordDims.target || !chordDims.value) {
        showError(chordDiv, 'Please select source, target, and value');
        return;
    }
    if (!state.loadedCategorical.includes(chordDims.source) || !state.loadedCategorical.includes(chordDims.target)) {
        showError(chordDiv, 'Source and target must be categorical fields');
        return;
    }
    if (!state.loadedNumerical.includes(chordDims.value)) {
        showError(chordDiv, 'Value must be a numerical field');
        return;
    }

    try {
        state.chordInstance = new ChordDiagram(chordDiv, state.loadedData, chordDims, state.colorScale);
        state.chordInstance.updateSelection(state.selectedItems);
    } catch (error) {
        showError(chordDiv, `Error rendering chord diagram: ${error.message}`);
    }
});

document.getElementById('generateForceBtn')?.addEventListener('click', () => {
    if (!state.loadedData) {
        showError(document.querySelector('#forceDirectedGraph .chart'), 'No data loaded');
        return;
    }
    const forceDiv = document.querySelector('#forceDirectedGraph .chart');
    if (!forceDiv) {
        console.warn('Force chart container not found');
        return;
    }
    forceDiv.innerHTML = '';

    const forceDims = {
        source: document.getElementById('force-source')?.value,
        target: document.getElementById('force-target')?.value,
        value: document.getElementById('force-value')?.value
    };

    if (!forceDims.source || !forceDims.target || !forceDims.value) {
        showError(forceDiv, 'Please select source, target, and value');
        return;
    }
    if (!state.loadedCategorical.includes(forceDims.source) || !state.loadedCategorical.includes(forceDims.target)) {
        showError(forceDiv, 'Source and target must be categorical fields');
        return;
    }
    if (!state.loadedNumerical.includes(forceDims.value)) {
        showError(forceDiv, 'Value must be a numerical field');
        return;
    }

    try {
        state.forceInstance = new ForceDirectedGraph(forceDiv, state.loadedData, forceDims, state.colorScale);
        state.forceInstance.updateSelection(state.selectedItems);
    } catch (error) {
        showError(forceDiv, `Error rendering force-directed graph: ${error.message}`);
    }
});

document.getElementById('generateSunburstBtn')?.addEventListener('click', () => {
    if (!state.loadedData) {
        showError(document.querySelector('#sunburstChart .chart'), 'No data loaded');
        return;
    }
    const sunburstDiv = document.querySelector('#sunburstChart .chart');
    if (!sunburstDiv) {
        console.warn('Sunburst chart container not found');
        return;
    }
    sunburstDiv.innerHTML = '';

    const hierarchySelect = document.getElementById('sunburst-hierarchy');
    const valueSelect = document.getElementById('sunburst-value');
    if (!hierarchySelect || !valueSelect) {
        showError(sunburstDiv, 'Hierarchy or value selector not found');
        return;
    }
    const hierarchyFields = Array.from(hierarchySelect.selectedOptions).map(opt => opt.value);
    const valueField = valueSelect.value;

    if (!hierarchyFields.length) {
        showError(sunburstDiv, 'Please select at least one hierarchy field');
        return;
    }
    if (!hierarchyFields.every(field => state.loadedCategorical.includes(field))) {
        showError(sunburstDiv, 'All hierarchy fields must be categorical');
        return;
    }
    if (valueField && !state.loadedNumerical.includes(valueField)) {
        showError(sunburstDiv, 'Value must be a numerical field');
        return;
    }

    const sunburstDims = {
        hierarchy: hierarchyFields,
        value: valueField || 'count'
    };

    try {
        state.sunburstInstance = new SunburstChart(sunburstDiv, state.loadedData, sunburstDims, state.colorScale);
        state.sunburstInstance.updateSelection(state.selectedItems);
    } catch (error) {
        showError(sunburstDiv, `Error rendering sunburst chart: ${error.message}`);
    }
});