console.log('force_directed.js: Loading script...');

class ForceDirectedGraph {
    constructor(container, data, dimensions, colorScale) {
        console.log('ForceDirectedGraph: Initializing with container:', container, 'data length:', data?.length, 'dimensions:', dimensions);

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
        console.log('ForceDirectedGraph: Initializing visualization');

        d3.select(this.container).selectAll('*').remove();

        const vizDiv = this.container.closest('.visualization');
        this.width = vizDiv.classList.contains('fullscreen') ? window.innerWidth - 40 : (this.container.offsetWidth || 500);
        this.height = vizDiv.classList.contains('fullscreen') ? window.innerHeight - 80 : (this.container.offsetHeight || 400);

        this.svg = d3.select(this.container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', `0 0 ${this.width} ${this.height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');

        this.g = this.svg.append('g');

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
            this.g.selectAll('circle').each(function(d) {
                const bbox = this.getBBox();
                const rectBox = rect.node().getBBox();
                if (bbox.x < rectBox.x + rectBox.width &&
                    bbox.x + bbox.width > rectBox.x &&
                    bbox.y < rectBox.y + rectBox.height &&
                    bbox.y + bbox.height > rectBox.y) {
                    selectedItems.add(d.id);
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
                    detail: { items: newSelection, source: 'force' }
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
                this.g.attr('transform', event.transform);
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
        const nodes = [...new Set(this.data.flatMap(d => [d[this.dimensions.source], d[this.dimensions.target]]))]
            .map(name => ({ id: name }));
        const links = this.data
            .filter(d => d[this.dimensions.source] && d[this.dimensions.target] && d[this.dimensions.value] != null)
            .map(d => ({
                source: d[this.dimensions.source],
                target: d[this.dimensions.target],
                value: d[this.dimensions.value] || 1
            }));

        return { nodes, links };
    }

    draw() {
        const { nodes, links } = this.processData();
        console.log('ForceDirectedGraph: Drawing with', nodes.length, 'nodes and', links.length, 'links');

        // Create a separate group for labels
        const labelGroup = this.g.append('g')
            .attr('class', 'force-label');

        const simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id(d => d.id).distance(80))
            .force('charge', d3.forceManyBody().strength(-150))
            .force('center', d3.forceCenter(this.width / 2, this.height / 2))
            .force('collision', d3.forceCollide().radius(30))
            .force('x', d3.forceX(this.width / 2).strength(0.1))
            .force('y', d3.forceY(this.height / 2).strength(0.1));

        const link = this.g.append('g')
            .attr('stroke', this.highContrast ? '#000' : '#999')
            .attr('stroke-opacity', 0.6)
            .selectAll('line')
            .data(links)
            .join('line')
            .attr('stroke-width', d => Math.sqrt(d.value))
            .attr('role', 'graphics-symbol')
            .attr('aria-label', d => `Link from ${d.source.id} to ${d.target.id}, Value: ${d.value}`);

        const node = this.g.append('g')
            .attr('stroke', this.highContrast ? '#000' : '#fff')
            .attr('stroke-width', 1.5)
            .selectAll('circle')
            .data(nodes)
            .join('circle')
            .attr('r', 6)
            .attr('fill', d => this.color(d.id))
            .attr('role', 'graphics-symbol')
            .attr('aria-label', d => `Node: ${d.id}`)
            .call(this.drag(simulation))
            .on('mouseover', (event, d) => {
                d3.select(event.currentTarget)
                    .transition().duration(200)
                    .attr('r', 10)
                    .attr('stroke-width', 2);
                eventBus.dispatchEvent(new CustomEvent('selection', {
                    detail: { items: new Set([d.id]), source: 'force' }
                }));
                this.tooltip.transition().duration(200).style('opacity', 0.9)
                    .html(`
                        <strong>${d.id}</strong><br>
                        Connections: ${links.filter(l => l.source.id === d.id || l.target.id === d.id).length}<br>
                        Total Value: ${d3.format(',')(d3.sum(links.filter(l => l.source.id === d.id || l.target.id === d.id), l => l.value))}
                    `)
                    .style('left', `${event.pageX + 10}px`)
                    .style('top', `${event.pageY + 10}px`);
            })
            .on('mousemove', (event) => {
                this.tooltip.style('left', `${event.pageX + 10}px`)
                    .style('top', `${event.pageY + 10}px`);
            })
            .on('mouseout', (event) => {
                d3.select(event.currentTarget)
                    .transition().duration(200)
                    .attr('r', 6)
                    .attr('stroke-width', 1.5);
                this.tooltip.transition().duration(500).style('opacity', 0);
            });

        // Create labels with background for better visibility
        const label = labelGroup.selectAll('g')
            .data(nodes)
            .join('g')
            .attr('class', 'node-label')
            .style('pointer-events', 'none');

        // Add background rectangle for each label
        label.append('rect')
            .attr('rx', 3)
            .attr('ry', 3)
            .attr('fill', 'white')
            .attr('fill-opacity', 0.8)
            .attr('stroke', '#ccc')
            .attr('stroke-width', 0.5);

        // Add text to each label
        label.append('text')
            .text(d => d.id.length > 10 ? `${d.id.slice(0, 8)}…` : d.id)
            .attr('dy', '0.35em')
            .attr('fill', this.highContrast ? '#000' : '#333')
            .attr('text-anchor', 'middle')
            .each(function(d) {
                const text = d3.select(this);
                const bbox = this.getBBox();
                const padding = 4;
                text.attr('x', bbox.width / 2 + padding);
                text.attr('y', bbox.height / 2);
                d3.select(this.parentNode).select('rect')
                    .attr('width', bbox.width + padding * 2)
                    .attr('height', bbox.height + padding * 2)
                    .attr('x', padding)
                    .attr('y', -bbox.height / 2);
            });

        simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);
            
            node
                .attr('cx', d => d.x)
                .attr('cy', d => d.y);

            // Position labels with their nodes
            label.attr('transform', d => `translate(${d.x},${d.y + 15})`);
        });
    }

    drag(simulation) {
        function dragstarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }

        function dragended(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }

        return d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended);
    }

    addLegend() {
        const legendContainer = d3.select(this.container.parentNode).select('.force-legend-container');
        legendContainer.selectAll('*').remove();

        const header = legendContainer.append('div')
            .attr('class', 'force-legend-header')
            .style('padding', '8px')
            .style('border-bottom', '1px solid #ddd');

        header.append('span')
            .attr('class', 'force-legend-title')
            .style('font-size', '14px')
            .style('font-weight', 'bold')
            .text('Node Legend');

        const toggleBtn = header.append('button')
            .attr('class', 'force-legend-toggle')
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
            .attr('class', 'force-legend-search')
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
            .attr('class', 'force-legend')
            .style('padding', '8px')
            .style('max-height', '200px')
            .style('overflow-y', 'auto');

        const items = legend.selectAll('div')
            .data(this.color.domain())
            .join('div')
            .attr('class', 'force-legend-item')
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
                    detail: { items: newSelection, source: 'force' }
                }));
            })
            .on('keypress', (event, d) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
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
                        detail: { items: newSelection, source: 'force' }
                    }));
                }
            });

        items.append('span')
            .style('width', '14px')
            .style('height', '14px')
            .style('border-radius', '50%')
            .style('background-color', d => this.color(d))
            .style('margin-right', '10px')
            .style('flex-shrink', '0')
            .style('box-shadow', '0 1px 3px rgba(0,0,0,0.2)');

        items.append('span')
            .text(d => d.length > 20 ? `${d.slice(0, 18)}…` : d)
            .style('font-size', '12px')
            .style('font-weight', '500')
            .style('white-space', 'nowrap')
            .style('overflow', 'hidden')
            .style('text-overflow', 'ellipsis')
            .append('title')
            .text(d => d);
    }

    updateSelection(selectedItems) {
        this.g.selectAll('circle')
            .transition().duration(200)
            .attr('fill-opacity', d => selectedItems.size === 0 || selectedItems.has(d.id) ? 1 : 0.3)
            .attr('stroke-width', d => selectedItems.has(d.id) ? 2 : 1.5);

        this.g.selectAll('line')
            .transition().duration(200)
            .attr('stroke-opacity', d => selectedItems.size === 0 || selectedItems.has(d.source.id) || selectedItems.has(d.target.id) ? 0.6 : 0.2);
    }

    updateData(newData) {
        console.log('ForceDirectedGraph: Updating data, new length:', newData?.length);
        if (!Array.isArray(newData) || !newData.length) {
            throw new Error('Invalid data: Must be a non-empty array');
        }
        this.data = newData;
        this.initialize();
    }
}

console.log('force_directed.js: ForceDirectedGraph defined');