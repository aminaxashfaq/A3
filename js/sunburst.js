class SunburstChart {
    constructor(container, data, dimensions, colorScale) {
        // Validate inputs
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('Invalid container: Must be an HTMLElement');
        }
        if (!Array.isArray(data) || !data.length) {
            throw new Error('Invalid data: Must be a non-empty array');
        }
        if (!dimensions || !dimensions.hierarchy || !Array.isArray(dimensions.hierarchy) || !dimensions.hierarchy.length) {
            throw new Error('Invalid dimensions: Must include a non-empty hierarchy array');
        }
        if (!colorScale || typeof colorScale !== 'function') {
            throw new Error('Invalid colorScale: Must be a function');
        }

        this.container = container;
        this.data = data;
        this.dimensions = dimensions;
        this.margin = { top: 60, right: 60, bottom: 60, left: 60 };
        this.highContrast = window.matchMedia('(prefers-contrast: high)').matches;
        this.color = colorScale;

        this.initialize();
        this.initZoomHandlers();
    }

    initialize() {
        // Clear container
        d3.select(this.container).selectAll('*').remove();

        // Set dimensions
        const vizDiv = this.container.closest('.visualization');
        this.width = vizDiv.classList.contains('fullscreen') ? window.innerWidth - 80 : (this.container.offsetWidth || 928);
        this.height = vizDiv.classList.contains('fullscreen') ? window.innerHeight - 120 : (this.container.offsetHeight || 928);
        this.radius = Math.min(this.width, this.height) / 6;

        // Create SVG
        this.svg = d3.select(this.container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', `0 0 ${this.width} ${this.height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .style('font', '12px sans-serif');

        this.g = this.svg.append('g')
            .attr('transform', `translate(${this.width / 2}, ${this.height / 2})`);

        // Initialize tooltip
        this.tooltip = d3.select('body')
            .append('div')
            .attr('class', 'tooltip')
            .style('opacity', 0);

        // Draw chart
        this.draw();
        this.addZoomPan();
        this.addLegend();
    }

    initZoomHandlers() {
        const vizDiv = this.container.closest('.visualization');
        const zoomInBtn = vizDiv.querySelector('.zoom-in-btn');
        const zoomOutBtn = vizDiv.querySelector('.zoom-out-btn');
        const resetBtn = vizDiv.querySelector('.reset-btn');
        const fullscreenBtn = vizDiv.querySelector('.fullscreen-btn');

        // Zoom buttons
        if (zoomInBtn) {
            zoomInBtn.onclick = () => this.adjustZoom(1.2);
        }
        if (zoomOutBtn) {
            zoomOutBtn.onclick = () => this.adjustZoom(0.8);
        }
        if (resetBtn) {
            resetBtn.onclick = () => this.resetZoom();
        }

        // Fullscreen toggle
        if (fullscreenBtn) {
            fullscreenBtn.onclick = () => {
                if (vizDiv.classList.contains('fullscreen')) {
                    vizDiv.classList.remove('fullscreen');
                    fullscreenBtn.textContent = '⛶';
                } else {
                    vizDiv.classList.add('fullscreen');
                    fullscreenBtn.textContent = '×';
                }
                this.initialize();
            };
        }
    }

    addZoomPan() {
        const zoom = d3.zoom()
            .scaleExtent([0.5, 8])
            .on('zoom', (event) => {
                this.g.attr('transform', event.transform);
                this.currentTransform = event.transform;
            });

        this.svg.call(zoom)
            .call(zoom.transform, d3.zoomIdentity.translate(this.width / 2, this.height / 2));
        this.currentTransform = d3.zoomIdentity.translate(this.width / 2, this.height / 2);

        this.svg.on('dblclick', () => this.resetZoom());
    }

    adjustZoom(factor) {
        this.currentTransform = this.currentTransform || d3.zoomIdentity.translate(this.width / 2, this.height / 2);
        const newScale = Math.max(0.5, Math.min(8, this.currentTransform.k * factor));
        this.svg.transition().duration(300)
            .call(d3.zoom().scaleTo, newScale);
    }

    resetZoom() {
        this.svg.transition().duration(400)
            .call(d3.zoom().transform, d3.zoomIdentity.translate(this.width / 2, this.height / 2));
        this.currentTransform = d3.zoomIdentity.translate(this.width / 2, this.height / 2);
    }

    processData() {
        const root = { name: 'root', children: [] };
        const valueField = this.dimensions.value || 'count';

        this.data.forEach(d => {
            let current = root;
            this.dimensions.hierarchy.forEach(dim => {
                const value = d[dim];
                if (value == null) return;
                let child = current.children.find(c => c.name === value);
                if (!child) {
                    child = { name: value, children: [] };
                    current.children.push(child);
                }
                current = child;
            });
            if (!current.value) current.value = 0;
            current.value += d[valueField] || 1;
        });

        const hierarchy = d3.hierarchy(root)
            .sum(d => d.value || 0)
            .sort((a, b) => b.value - a.value);

        return d3.partition()
            .size([2 * Math.PI, hierarchy.height + 1])(hierarchy);
    }

    draw() {
        const root = this.processData();
        root.each(d => d.current = d);

        // Arc generator
        const arc = d3.arc()
            .startAngle(d => d.x0)
            .endAngle(d => d.x1)
            .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005))
            .padRadius(this.radius * 1.5)
            .innerRadius(d => d.y0 * this.radius)
            .outerRadius(d => Math.max(d.y0 * this.radius, d.y1 * this.radius - 1));

        // Arcs
        const path = this.g.append('g')
            .selectAll('path')
            .data(root.descendants().slice(1))
            .join('path')
            .attr('fill', d => this.color(d.data.name))
            .attr('fill-opacity', d => arcVisible(d.current) ? (d.children ? 0.6 : 0.4) : 0)
            .attr('pointer-events', d => arcVisible(d.current) ? 'auto' : 'none')
            .attr('d', d => arc(d.current))
            .attr('role', 'graphics-symbol')
            .attr('aria-label', d => `Segment: ${d.data.name}, Value: ${d.value}`)
            .on('mouseover', (event, d) => {
                d3.select(event.currentTarget)
                    .attr('fill-opacity', 0.8)
                    .attr('stroke', this.highContrast ? '#000' : '#fff')
                    .attr('stroke-width', 2);

                const ancestors = d.ancestors().reverse().map(a => a.data.name).join(' › ');
                const total = root.value;
                const percentage = ((d.value / total) * 100).toFixed(1);

                this.tooltip.transition().duration(200).style('opacity', 0.9)
                    .html(`
                        <strong>${d.data.name}</strong><br>
                        Path: ${ancestors}<br>
                        Value: ${d3.format(',')(d.value)}<br>
                        Percentage: ${percentage}%
                    `);
                this.positionTooltip(event);
            })
            .on('mousemove', (event) => this.positionTooltip(event))
            .on('mouseout', (event) => {
                d3.select(event.currentTarget)
                    .attr('fill-opacity', d => d.children ? 0.6 : 0.4)
                    .attr('stroke', 'none');
                this.tooltip.transition().duration(500).style('opacity', 0);
            });

        // Zoom on click
        path.filter(d => d.children)
            .style('cursor', 'pointer')
            .on('click', (event, p) => this.clicked(event, p, root, path, arc));

        // Labels
        const label = this.g.append('g')
            .attr('pointer-events', 'none')
            .attr('text-anchor', 'middle')
            .style('user-select', 'none')
            .selectAll('text')
            .data(root.descendants().slice(1))
            .join('text')
            .attr('dy', '0.35em')
            .attr('fill', this.highContrast ? '#000' : '#333')
            .attr('fill-opacity', d => +labelVisible(d.current))
            .attr('transform', d => labelTransform(d.current, this.radius))
            .text(d => d.data.name.length > 15 ? `${d.data.name.slice(0, 12)}…` : d.data.name)
            .append('title')
            .text(d => d.data.name);

        // Parent circle for zoom out
        this.g.append('circle')
            .datum(root)
            .attr('r', this.radius)
            .attr('fill', 'none')
            .attr('pointer-events', 'all')
            .on('click', event => this.clicked(event, root, root, path, arc));
    }

    positionTooltip(event) {
        const tooltipWidth = this.tooltip.node().offsetWidth;
        const tooltipHeight = this.tooltip.node().offsetHeight;
        const containerRect = this.container.getBoundingClientRect();
        let left = event.pageX + 10;
        let top = event.pageY + 10;

        if (left + tooltipWidth > containerRect.right) {
            left = event.pageX - tooltipWidth - 10;
        }
        if (top + tooltipHeight > containerRect.bottom) {
            top = event.pageY - tooltipHeight - 10;
        }

        this.tooltip.style('left', `${left}px`).style('top', `${top}px`);
    }

    clicked(event, p, root, path, arc) {
        this.g.select('circle').datum(p.parent || root);
        root.each(d => d.target = {
            x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
            x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
            y0: Math.max(0, d.y0 - p.depth),
            y1: Math.max(0, d.y1 - p.depth)
        });

        const t = this.g.transition().duration(event.altKey ? 7500 : 750);
        path.transition(t)
            .tween('data', d => {
                const i = d3.interpolate(d.current, d.target);
                return t => d.current = i(t);
            })
            .filter(function(d) {
                return +this.getAttribute('fill-opacity') || arcVisible(d.target);
            })
            .attr('fill-opacity', d => arcVisible(d.target) ? (d.children ? 0.6 : 0.4) : 0)
            .attr('pointer-events', d => arcVisible(d.target) ? 'auto' : 'none')
            .attrTween('d', d => () => arc(d.current));

        this.g.selectAll('text')
            .filter(function(d) {
                return +this.getAttribute('fill-opacity') || labelVisible(d.target);
            })
            .transition(t)
            .attr('fill-opacity', d => +labelVisible(d.target))
            .attrTween('transform', d => () => labelTransform(d.current, this.radius));
    }

    addLegend() {
        const legendContainer = d3.select(this.container.parentNode).select('.sunburst-legend-container');
        legendContainer.selectAll('*').remove();

        const header = legendContainer.append('div')
            .attr('class', 'sunburst-legend-header');

        header.append('span')
            .attr('class', 'sunburst-legend-title')
            .text('Segment Legend');

        const toggleBtn = header.append('button')
            .attr('class', 'sunburst-legend-toggle')
            .text('−')
            .on('click', () => {
                const isCollapsed = legendContainer.classed('collapsed');
                legendContainer.classed('collapsed', !isCollapsed);
                toggleBtn.text(isCollapsed ? '−' : '+');
                legend.style('display', isCollapsed ? 'block' : 'none');
            });

        const searchInput = header.append('input')
            .attr('class', 'sunburst-legend-search')
            .attr('type', 'text')
            .attr('placeholder', 'Search segments...')
            .on('input', function() {
                const query = this.value.toLowerCase();
                legend.selectAll('div')
                    .style('display', d => d.toLowerCase().includes(query) ? 'flex' : 'none');
            });

        const legend = legendContainer.append('div')
            .attr('class', 'sunburst-legend');

        const items = legend.selectAll('div')
            .data(this.color.domain())
            .join('div')
            .attr('tabindex', 0)
            .style('display', 'flex')
            .on('click', (event, d) => {
                const path = this.g.selectAll('path')
                    .filter(p => p.data.name === d || p.ancestors().some(a => a.data.name === d));
                path.each((p, i, nodes) => {
                    if (p.children) {
                        this.clicked(event, p, this.processData(), this.g.selectAll('path'), d3.arc()
                            .startAngle(d => d.x0)
                            .endAngle(d => d.x1)
                            .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005))
                            .padRadius(this.radius * 1.5)
                            .innerRadius(d => d.y0 * this.radius)
                            .outerRadius(d => Math.max(d.y0 * this.radius, d.y1 * this.radius - 1)));
                    }
                });
            })
            .on('keypress', (event, d) => {
                if (event.key === 'Enter' || event.key === 'Space') {
                    const path = this.g.selectAll('path')
                        .filter(p => p.data.name === d || p.ancestors().some(a => a.data.name === d));
                    path.each((p, i, nodes) => {
                        if (p.children) {
                            this.clicked(event, p, this.processData(), this.g.selectAll('path'), d3.arc()
                                .startAngle(d => d.x0)
                                .endAngle(d => d.x1)
                                .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005))
                                .padRadius(this.radius * 1.5)
                                .innerRadius(d => d.y0 * this.radius)
                                .outerRadius(d => Math.max(d.y0 * this.radius, d.y1 * this.radius - 1)));
                        }
                    });
                }
            });

        items.append('span')
            .style('width', '12px')
            .style('height', '12px')
            .style('border-radius', '4px')
            .style('background-color', d => this.color(d))
            .style('margin-right', '6px');

        items.append('span')
            .text(d => d.length > 20 ? `${d.slice(0, 18)}…` : d)
            .append('title')
            .text(d => d);
    }

    updateSelection(selectedItems) {
        this.g.selectAll('path')
            .attr('fill-opacity', d => selectedItems.size === 0 || selectedItems.has(d.data.name) ? (d.children ? 0.6 : 0.4) : 0.2)
            .attr('stroke', d => selectedItems.has(d.data.name) ? (this.highContrast ? '#000' : '#fff') : 'none')
            .attr('stroke-width', d => selectedItems.has(d.data.name) ? 2 : 0);
    }

    updateData(newData) {
        if (!Array.isArray(newData) || !newData.length) {
            throw new Error('Invalid data: Must be a non-empty array');
        }
        this.data = newData;
        this.initialize();
    }
}

function arcVisible(d) {
    return d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
}

function labelVisible(d) {
    return d.y1 <= 3 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03;
}

function labelTransform(d, radius) {
    const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
    const y = (d.y0 + d.y1) / 2 * radius;
    return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
}