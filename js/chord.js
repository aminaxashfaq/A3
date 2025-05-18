console.log('chord.js: Loading script...');

class ChordDiagram {
    constructor(container, data, dimensions, colorScale) {
        console.log('ChordDiagram: Initializing with container:', container, 'data length:', data?.length, 'dimensions:', dimensions);

        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('Invalid container: Must be an HTMLElement');
        }
        if (!Array.isArray(data) || !data.length) {
            throw new Error('Invalid data: Must be a non-empty array');
        }
        if (!dimensions || !dimensions.source || !dimensions.target || !dimensions.value) {
            throw new Error('Invalid dimensions: Must include source, target, and value');
        }

        this.container = container;
        this.data = data;
        this.dimensions = dimensions;
        this.margin = { top: 20, right: 20, bottom: 20, left: 20 };
        this.highContrast = window.matchMedia('(prefers-contrast: high)').matches;
        this.color = colorScale;

        this.initialize();
        this.initZoomHandlers();
        this.initDragSelection();
    }

    initialize() {
        console.log('ChordDiagram: Initializing visualization');

        d3.select(this.container).selectAll('*').remove();

        const vizDiv = this.container.closest('.visualization');
        this.width = vizDiv.classList.contains('fullscreen') ? window.innerWidth - 40 : (this.container.offsetWidth || 500);
        this.height = vizDiv.classList.contains('fullscreen') ? window.innerHeight - 80 : (this.container.offsetHeight || 400);
        this.radius = Math.min(this.width, this.height) / 2 - 40;

        this.svg = d3.select(this.container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', `0 0 ${this.width} ${this.height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');

        this.g = this.svg.append('g')
            .attr('transform', `translate(${this.width / 2}, ${this.height / 2})`);

        this.tooltip = d3.select('body')
            .append('div')
            .attr('class', 'tooltip')
            .style('opacity', 0);

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

        if (zoomInBtn) zoomInBtn.onclick = () => this.adjustZoom(1.25);
        if (zoomOutBtn) zoomOutBtn.onclick = () => this.adjustZoom(0.8);
        if (resetBtn) resetBtn.onclick = () => this.resetZoom();
        if (fullscreenBtn) {
            fullscreenBtn.onclick = () => {
                vizDiv.classList.toggle('fullscreen');
                fullscreenBtn.textContent = vizDiv.classList.contains('fullscreen') ? '×' : '⛶';
                this.initialize();
            };
        }
    }

    initDragSelection() {
        let startPoint = null;
        const selectedItems = new Set();
        const nodes = [...new Set(this.data.flatMap(d => [d[this.dimensions.source], d[this.dimensions.target]]))];

        this.svg.on('mousedown', (event) => {
            if (event.button !== 0) return;
            startPoint = [event.offsetX, event.offsetY];
            this.g.append('rect')
                .attr('class', 'selection-rect')
                .attr('x', startPoint[0] - this.width / 2)
                .attr('y', startPoint[1] - this.height / 2)
                .attr('width', 0)
                .attr('height', 0)
                .attr('fill', 'rgba(0, 0, 255, 0.2)')
                .attr('stroke', '#00f')
                .attr('stroke-width', 1);
        });

        this.svg.on('mousemove', (event) => {
            if (!startPoint) return;
            const currentPoint = [event.offsetX, event.offsetY];
            const rect = this.g.select('.selection-rect');
            rect.attr('x', Math.min(startPoint[0], currentPoint[0]) - this.width / 2)
                .attr('y', Math.min(startPoint[1], currentPoint[1]) - this.height / 2)
                .attr('width', Math.abs(currentPoint[0] - startPoint[0]))
                .attr('height', Math.abs(currentPoint[1] - startPoint[1]));

            selectedItems.clear();
            this.g.selectAll('path[role="graphics-symbol"]').each(function(d) {
                const bbox = this.getBBox();
                const rectBox = rect.node().getBBox();
                if (bbox.x < rectBox.x + rectBox.width &&
                    bbox.x + bbox.width > rectBox.x &&
                    bbox.y < rectBox.y + rectBox.height &&
                    bbox.y + bbox.height > rectBox.y) {
                    const node = d.source ? nodes[d.source.index] : nodes[d.index];
                    selectedItems.add(node);
                }
            });
        });

        this.svg.on('mouseup', () => {
            if (!startPoint) return;
            this.g.select('.selection-rect').remove();
            if (selectedItems.size > 0) {
                const newSelection = new Set(state.selectedItems);
                if (d3.event.shiftKey || d3.event.ctrlKey) {
                    selectedItems.forEach(item => {
                        if (newSelection.has(item)) {
                            newSelection.delete(item);
                        } else {
                            newSelection.add(item);
                        }
                    });
                } else {
                    newSelection.clear();
                    selectedItems.forEach(item => newSelection.add(item));
                }
                eventBus.dispatchEvent(new CustomEvent('selection', {
                    detail: { items: newSelection, source: 'chord' }
                }));
            }
            startPoint = null;
            selectedItems.clear();
        });
    }

    addZoomPan() {
        const zoom = d3.zoom()
            .scaleExtent([0.5, 5])
            .on('zoom', (event) => {
                this.g.attr('transform', `translate(${this.width / 2}, ${this.height / 2}) scale(${event.transform.k})`);
                this.currentTransform = event.transform;
            });

        this.svg.call(zoom)
            .call(zoom.transform, d3.zoomIdentity);
        this.currentTransform = d3.zoomIdentity;

        this.svg.on('dblclick', () => this.resetZoom());
    }

    adjustZoom(factor) {
        this.currentTransform = this.currentTransform || d3.zoomIdentity;
        const newScale = Math.max(0.5, Math.min(5, this.currentTransform.k * factor));
        this.svg.transition().duration(300)
            .call(d3.zoom().scaleTo, newScale);
    }

    resetZoom() {
        this.svg.transition().duration(400)
            .call(d3.zoom().transform, d3.zoomIdentity);
        this.currentTransform = d3.zoomIdentity;
    }

    processData() {
        const nodes = [...new Set(this.data.flatMap(d => [d[this.dimensions.source], d[this.dimensions.target]]))];
        const matrix = Array(nodes.length).fill().map(() => Array(nodes.length).fill(0));

        this.data.forEach(d => {
            const sourceIdx = nodes.indexOf(d[this.dimensions.source]);
            const targetIdx = nodes.indexOf(d[this.dimensions.target]);
            if (sourceIdx !== -1 && targetIdx !== -1 && d[this.dimensions.value] != null) {
                matrix[sourceIdx][targetIdx] += d[this.dimensions.value] || 1;
            }
        });

        return { nodes, matrix };
    }

    draw() {
        const { nodes, matrix } = this.processData();
        console.log('ChordDiagram: Drawing with', nodes.length, 'nodes');

        const chord = d3.chord()
            .padAngle(0.05)
            .sortSubgroups(d3.descending);

        const chords = chord(matrix);

        const ribbon = d3.ribbon()
            .radius(this.radius - 10);

        this.g.append('text')
            .attr('class', 'chord-title')
            .attr('x', 0)
            .attr('y', -this.radius - 30)
            .attr('text-anchor', 'middle')
            .style('font-size', '16px')
            .style('font-weight', 'bold')
            .text('Flow Relationships');

        this.g.append('text')
            .attr('class', 'chord-subtitle')
            .attr('x', 0)
            .attr('y', -this.radius - 10)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('fill', '#666')
            .text('Hover over segments to see details');

        const group = this.g.append('g')
            .selectAll('g')
            .data(chords.groups)
            .join('g');

        group.append('path')
            .attr('fill', d => this.color(nodes[d.index]))
            .attr('stroke', this.highContrast ? '#000' : '#fff')
            .attr('stroke-width', 2)
            .attr('d', d3.arc().innerRadius(this.radius - 10).outerRadius(this.radius))
            .attr('role', 'graphics-symbol')
            .attr('aria-label', d => `Group: ${nodes[d.index]}, Value: ${d.value}`)
            .on('mouseover', (event, d) => {
                d3.select(event.currentTarget)
                    .transition().duration(200)
                    .attr('stroke-width', 3)
                    .attr('stroke', '#000');
                const node = nodes[d.index];
                eventBus.dispatchEvent(new CustomEvent('selection', {
                    detail: { items: new Set([node]), source: 'chord' }
                }));
                const totalFlow = d3.sum(matrix[d.index]);
                const incomingFlow = d3.sum(matrix.map(row => row[d.index]));
                const outgoingFlow = d3.sum(matrix[d.index]);
                this.tooltip.transition().duration(200).style('opacity', 0.9)
                    .html(`
                        <div class="tooltip-content" style="background: rgba(255, 255, 255, 0.95); padding: 10px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
                            <div style="font-size: 14px; font-weight: bold; margin-bottom: 8px; color: ${this.color(nodes[d.index])}">${nodes[d.index]}</div>
                            <div style="font-size: 12px; line-height: 1.4;">
                                <div style="margin-bottom: 4px;">Total Flow: <strong>${d3.format(',')(totalFlow)}</strong></div>
                                <div style="margin-bottom: 4px;">Incoming: <strong>${d3.format(',')(incomingFlow)}</strong></div>
                                <div>Outgoing: <strong>${d3.format(',')(outgoingFlow)}</strong></div>
                            </div>
                        </div>
                    `)
                    .style('left', `${event.pageX + 15}px`)
                    .style('top', `${event.pageY + 15}px`);
            })
            .on('mousemove', (event) => {
                this.tooltip.style('left', `${event.pageX + 15}px`)
                    .style('top', `${event.pageY + 15}px`);
            })
            .on('mouseout', (event) => {
                d3.select(event.currentTarget)
                    .transition().duration(200)
                    .attr('stroke-width', 2)
                    .attr('stroke', this.highContrast ? '#000' : '#fff');
                this.tooltip.transition().duration(500).style('opacity', 0);
            })
            .on('click', (event, d) => {
                const node = nodes[d.index];
                const newSelection = new Set(state.selectedItems);
                if (event.shiftKey || event.ctrlKey) {
                    if (newSelection.has(node)) {
                        newSelection.delete(node);
                    } else {
                        newSelection.add(node);
                    }
                } else {
                    newSelection.clear();
                    newSelection.add(node);
                }
                eventBus.dispatchEvent(new CustomEvent('selection', {
                    detail: { items: newSelection, source: 'chord' }
                }));
            });

        group.append('text')
            .attr('class', 'chord-label')
            .each(d => {
                d.angle = (d.startAngle + d.endAngle) / 2;
                d.totalFlow = d3.sum(matrix[d.index]);
                d.incomingFlow = d3.sum(matrix.map(row => row[d.index]));
                d.outgoingFlow = d3.sum(matrix[d.index]);
            })
            .attr('dy', d => d.angle > Math.PI ? 25 : -15)
            .attr('transform', d => `
                rotate(${(d.angle * 180 / Math.PI - 90)})
                translate(${this.radius + 20})
                ${d.angle > Math.PI ? 'rotate(180)' : ''}
            `)
            .attr('text-anchor', d => d.angle > Math.PI ? 'end' : 'start')
            .html(d => {
                const name = nodes[d.index];
                const displayName = name.length > 15 ? name.slice(0, 12) + '...' : name;
                const totalFlow = d3.format(',')(d.totalFlow);
                return `
                    <tspan x="0" dy="0">${displayName}</tspan>
                    <tspan x="0" dy="1.2em" style="font-size: 10px; fill: #666;">${totalFlow}</tspan>
                `;
            })
            .attr('fill', this.highContrast ? '#000' : '#333')
            .attr('font-size', '12px')
            .attr('font-weight', '600')
            .attr('aria-hidden', 'true')
            .append('title')
            .text(d => `${nodes[d.index]}\nTotal Flow: ${d3.format(',')(d.totalFlow)}\nIncoming: ${d3.format(',')(d.incomingFlow)}\nOutgoing: ${d3.format(',')(d.outgoingFlow)}`);

        this.g.append('g')
            .selectAll('path')
            .data(chords)
            .join('path')
            .attr('d', ribbon)
            .attr('fill', d => this.color(nodes[d.source.index]))
            .attr('opacity', 0.85)
            .attr('stroke', this.highContrast ? '#000' : '#fff')
            .attr('stroke-width', 1)
            .attr('role', 'graphics-symbol')
            .attr('aria-label', d => `Flow from ${nodes[d.source.index]} to ${nodes[d.target.index]}, Value: ${d.source.value}`)
            .on('mouseover', (event, d) => {
                d3.select(event.currentTarget)
                    .transition().duration(200)
                    .attr('opacity', 1)
                    .attr('stroke-width', 2);
                const sourceName = nodes[d.source.index];
                eventBus.dispatchEvent(new CustomEvent('selection', {
                    detail: { items: new Set([sourceName]), source: 'chord' }
                }));
                const targetName = nodes[d.target.index];
                const value = d.source.value;
                const totalSource = d3.sum(matrix[d.source.index]);
                const totalTarget = d3.sum(matrix[d.target.index]);
                const sourcePercentage = ((value / totalSource) * 100).toFixed(1);
                const targetPercentage = ((value / totalTarget) * 100).toFixed(1);
                this.tooltip.transition().duration(200).style('opacity', 0.9)
                    .html(`
                        <div class="tooltip-content" style="background: rgba(255, 255, 255, 0.95); padding: 10px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
                            <div style="font-size: 14px; font-weight: bold; margin-bottom: 8px;">
                                <span style="color: ${this.color(sourceName)}">${sourceName}</span> → 
                                <span style="color: ${this.color(targetName)}">${targetName}</span>
                            </div>
                            <div style="font-size: 12px; line-height: 1.4;">
                                <div style="margin-bottom: 4px;">Value: <strong>${d3.format(',')(value)}</strong></div>
                                <div style="margin-bottom: 4px;">${sourcePercentage}% of ${sourceName}'s total</div>
                                <div>${targetPercentage}% of ${targetName}'s total</div>
                            </div>
                        </div>
                    `)
                    .style('left', `${event.pageX + 15}px`)
                    .style('top', `${event.pageY + 15}px`);
            })
            .on('mousemove', (event) => {
                this.tooltip.style('left', `${event.pageX + 15}px`)
                    .style('top', `${event.pageY + 15}px`);
            })
            .on('mouseout', (event) => {
                d3.select(event.currentTarget)
                    .transition().duration(200)
                    .attr('opacity', 0.85)
                    .attr('stroke-width', 1);
                this.tooltip.transition().duration(500).style('opacity', 0);
            })
            .on('click', (event, d) => {
                const sourceName = nodes[d.source.index];
                const targetName = nodes[d.target.index];
                const newSelection = new Set(state.selectedItems);
                if (event.shiftKey || event.ctrlKey) {
                    if (newSelection.has(sourceName)) {
                        newSelection.delete(sourceName);
                    } else {
                        newSelection.add(sourceName);
                    }
                    if (newSelection.has(targetName)) {
                        newSelection.delete(targetName);
                    } else {
                        newSelection.add(targetName);
                    }
                } else {
                    newSelection.clear();
                    newSelection.add(sourceName);
                    newSelection.add(targetName);
                }
                eventBus.dispatchEvent(new CustomEvent('selection', {
                    detail: { items: newSelection, source: 'chord' }
                }));
            });

        this.g.append('g')
            .selectAll('text')
            .data(chords)
            .join('text')
            .attr('class', 'chord-value-label')
            .each(d => {
                const sourceName = nodes[d.source.index];
                const targetName = nodes[d.target.index];
                const value = d.source.value;
                const totalSource = d3.sum(matrix[d.source.index]);
                const totalTarget = d3.sum(matrix[d.target.index]);
                const sourcePercentage = ((value / totalSource) * 100).toFixed(1);
                const targetPercentage = ((value / totalTarget) * 100).toFixed(1);
                d.label = `${sourcePercentage}% → ${targetPercentage}%`;
            })
            .attr('transform', d => {
                const angle = (d.source.startAngle + d.source.endAngle) / 2;
                const radius = this.radius - 20;
                const x = radius * Math.cos(angle);
                const y = radius * Math.sin(angle);
                return `translate(${x}, ${y}) rotate(${angle * 180 / Math.PI - 90})`;
            })
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .style('font-size', '10px')
            .style('fill', '#666')
            .style('pointer-events', 'none')
            .text(d => d.label)
            .style('opacity', d => d.source.value > 0 ? 0.7 : 0);
    }

    addLegend() {
        const legendContainer = d3.select(this.container.parentNode).select('.chord-legend-container');
        legendContainer.selectAll('*').remove();

        const header = legendContainer.append('div')
            .attr('class', 'chord-legend-header')
            .style('padding', '8px')
            .style('border-bottom', '1px solid #ddd');

        header.append('span')
            .attr('class', 'chord-legend-title')
            .style('font-size', '14px')
            .style('font-weight', 'bold')
            .text('Node Legend');

        const toggleBtn = header.append('button')
            .attr('class', 'chord-legend-toggle')
            .style('float', 'right')
            .style('border', 'none')
            .style('background', 'none')
            .style('cursor', 'pointer')
            .style('font-size', '16px')
            .text('−')
            .attr('aria-label', 'Toggle legend visibility')
            .on('click', () => {
                const isCollapsed = legendContainer.classed('collapsed');
                legendContainer.classed('collapsed', !isCollapsed);
                toggleBtn.text(isCollapsed ? '−' : '+');
                legend.style('display', isCollapsed ? 'block' : 'none');
            });

        const searchInput = header.append('input')
            .attr('class', 'chord-legend-search')
            .attr('type', 'text')
            .style('width', '100%')
            .style('margin-top', '8px')
            .style('padding', '4px 8px')
            .style('border', '1px solid #ddd')
            .style('border-radius', '4px')
            .attr('placeholder', 'Search nodes...')
            .attr('aria-label', 'Search nodes in legend')
            .on('input', function() {
                const query = this.value.toLowerCase();
                legend.selectAll('div')
                    .style('display', d => d.toLowerCase().includes(query) ? 'flex' : 'none');
            });

        const legend = legendContainer.append('div')
            .attr('class', 'chord-legend')
            .style('padding', '8px')
            .style('max-height', '200px')
            .style('overflow-y', 'auto');

        const items = legend.selectAll('div')
            .data(this.color.domain())
            .join('div')
            .attr('class', 'chord-legend-item')
            .attr('tabindex', 0)
            .attr('role', 'button')
            .attr('aria-label', d => `Highlight node ${d}`)
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('padding', '6px 8px')
            .style('margin', '2px 0')
            .style('border-radius', '4px')
            .style('cursor', 'pointer')
            .style('transition', 'background-color 0.2s')
            .on('mouseover', function() {
                d3.select(this)
                    .style('background-color', 'rgba(0, 0, 0, 0.05)')
                    .style('transform', 'translateX(4px)');
            })
            .on('mouseout', function() {
                d3.select(this)
                    .style('background-color', 'transparent')
                    .style('transform', 'translateX(0)');
            })
            .on('click', (event, d) => {
                const newSelection = new Set(state.selectedItems);
                if (event.shiftKey || event.ctrlKey) {
                    if (newSelection.has(d)) {
                        newSelection.delete(d);
                    } else {
                        newSelection.add(d);
                    }
                } else {
                    newSelection.clear();
                    newSelection.add(d);
                }
                eventBus.dispatchEvent(new CustomEvent('selection', {
                    detail: { items: newSelection, source: 'chord' }
                }));
            });

        items.append('span')
            .style('width', '14px')
            .style('height', '14px')
            .style('border-radius', '4px')
            .style('background-color', d => this.color(d))
            .style('margin-right', '10px')
            .style('flex-shrink', '0')
            .style('box-shadow', '0 1px 3px rgba(0,0,0,0.2)');

        items.append('span')
            .text(d => d)
            .style('font-size', '12px')
            .style('font-weight', '500')
            .style('white-space', 'nowrap')
            .style('overflow', 'hidden')
            .style('text-overflow', 'ellipsis')
            .append('title')
            .text(d => d);
    }

    updateSelection(selectedItems) {
        const nodes = [...new Set(this.data.flatMap(d => [d[this.dimensions.source], d[this.dimensions.target]]))];
        this.g.selectAll('path[role="graphics-symbol"]')
            .transition().duration(200)
            .attr('opacity', d => {
                const node = d.source ? nodes[d.source.index] : nodes[d.index];
                return selectedItems.size === 0 || selectedItems.has(node) ? 1 : 0.3;
            })
            .attr('stroke-width', d => {
                const node = d.source ? nodes[d.source.index] : nodes[d.index];
                return selectedItems.has(node) ? 3 : (d.source ? 1 : 2);
            });
    }

    updateData(newData) {
        console.log('ChordDiagram: Updating data, new length:', newData?.length);
        if (!Array.isArray(newData) || !newData.length) {
            throw new Error('Invalid data: Must be a non-empty array');
        }
        this.data = newData;
        this.initialize();
    }
}

console.log('chord.js: ChordDiagram defined');