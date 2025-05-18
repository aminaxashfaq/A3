class RadialBarChart {
    constructor(container, data, dimensions, colorScale) {
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('Invalid container: Must be an HTMLElement');
        }
        if (!Array.isArray(data) || !data.length) {
            throw new Error('Invalid data: Must be a non-empty array');
        }
        if (!dimensions || !dimensions.category || !dimensions.value) {
            throw new Error('Invalid dimensions: Must include category and value');
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
        d3.select(this.container).selectAll('*').remove();

        const vizDiv = this.container.closest('.visualization');
        this.width = vizDiv.classList.contains('fullscreen') ? window.innerWidth - 80 : (this.container.offsetWidth || 500);
        this.height = vizDiv.classList.contains('fullscreen') ? window.innerHeight - 120 : (this.container.offsetHeight || 400);

        const keys = [this.dimensions.value];
        const legendItemHeight = 12;
        const legendWidth = 150;
        const legendHeight = keys.length * legendItemHeight + 16;
        const legendDiagonal = Math.sqrt(legendWidth * legendWidth + legendHeight * legendHeight);

        this.radius = Math.min(
            this.width - this.margin.left - this.margin.right,
            this.height - this.margin.top - this.margin.bottom
        ) / 2;
        this.innerRadius = Math.max(this.radius * 0.45, legendDiagonal / 2 + 15);
        this.outerRadius = Math.min(this.innerRadius + this.radius * 1.5, this.radius * 2);

        this.svg = d3.select(this.container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', `0 0 ${this.width} ${this.height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');

        this.defs = this.svg.append('defs');
        this.g = this.svg.append('g')
            .attr('transform', `translate(${this.width / 2}, ${this.height / 2})`);

        this.tooltip = d3.select('body')
            .append('div')
            .attr('class', 'tooltip')
            .style('opacity', 0);

        this.drawGrid();
        this.drawStacked();
        this.drawCentralLegend();
        this.addZoomPan();
    }

    initZoomHandlers() {
        const vizDiv = this.container.closest('.visualization');
        const zoomInBtn = vizDiv.querySelector('.zoom-in-btn');
        const zoomOutBtn = vizDiv.querySelector('.zoom-out-btn');
        const resetBtn = vizDiv.querySelector('.reset-btn');
        const fullscreenBtn = vizDiv.querySelector('.fullscreen-btn');

        if (zoomInBtn) zoomInBtn.onclick = () => this.adjustZoom(1.2);
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
            this.g.selectAll('.stack-layer path').each(function(d) {
                const bbox = this.getBBox();
                const rectBox = rect.node().getBBox();
                if (bbox.x < rectBox.x + rectBox.width &&
                    bbox.x + bbox.width > rectBox.x &&
                    bbox.y < rectBox.y + rectBox.height &&
                    bbox.y + bbox.height > rectBox.y) {
                    selectedItems.add(d.data[d3.select(this.parentNode).datum().key]);
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
                    detail: { items: newSelection, source: 'radial' }
                }));
            }
            startPoint = null;
            selectedItems.clear();
        });
    }

    addZoomPan() {
        const zoom = d3.zoom()
            .scaleExtent([0.7, 6])
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
        const newScale = Math.max(0.7, Math.min(6, this.currentTransform.k * factor));
        this.svg.transition().duration(300)
            .call(d3.zoom().scaleTo, newScale);
    }

    resetZoom() {
        this.svg.transition().duration(400)
            .call(d3.zoom().transform, d3.zoomIdentity.translate(this.width / 2, this.height / 2));
        this.currentTransform = d3.zoomIdentity.translate(this.width / 2, this.height / 2);
    }

    drawGrid() {
        const keys = [this.dimensions.value];
        const stackedData = d3.stack().keys(keys)(this.data);
        const maxValue = d3.max(stackedData, layer => d3.max(layer, d => d[1]));
        const radialScale = d3.scaleRadial()
            .domain([0, maxValue])
            .range([this.innerRadius, this.outerRadius]);
        const ticks = radialScale.ticks(4);

        this.g.selectAll('.radial-grid')
            .data(ticks)
            .join('circle')
            .attr('class', 'radial-grid')
            .attr('r', d => radialScale(d))
            .attr('fill', 'none')
            .attr('stroke', this.highContrast ? '#000' : '#111')
            .attr('stroke-width', 2)
            .attr('stroke-opacity', 0.7);

        this.g.selectAll('.radial-tick-label')
            .data(ticks)
            .join('text')
            .attr('class', 'radial-tick-label')
            .attr('y', d => -radialScale(d))
            .attr('text-anchor', 'middle')
            .attr('dy', '-0.35em')
            .attr('fill', this.highContrast ? '#000' : '#222')
            .attr('font-size', '0.85em')
            .attr('font-weight', '500')
            .text((d, i) => i === ticks.length - 1 ? `Total\n${this.formatTick(d)}` : this.formatTick(d));
    }

    formatTick(d) {
        if (d >= 1e6) return `${(d / 1e6).toFixed(1)}M`;
        if (d >= 1e3) return `${(d / 1e3).toFixed(1)}K`;
        return d.toLocaleString();
    }

    drawStacked() {
        const { category, value } = this.dimensions;
        const keys = [value];
        const stackedData = d3.stack().keys(keys)(this.data);

        const angleScale = d3.scaleBand()
            .domain(this.data.map(d => d[category]))
            .range([0, 2 * Math.PI])
            .align(0)
            .padding(0.15);

        const maxValue = d3.max(stackedData, layer => d3.max(layer, d => d[1]));
        const radialScale = d3.scaleRadial()
            .domain([0, maxValue])
            .range([this.innerRadius, this.outerRadius]);

        const arc = d3.arc()
            .innerRadius(d => radialScale(d[0]))
            .outerRadius(d => radialScale(d[1]))
            .startAngle(d => angleScale(d.data[category]))
            .endAngle(d => angleScale(d.data[category]) + angleScale.bandwidth());

        this.g.selectAll('.stack-layer')
            .data(stackedData)
            .join('g')
            .attr('class', 'stack-layer')
            .selectAll('path')
            .data(d => d)
            .join('path')
            .attr('d', arc)
            .attr('fill', d => this.color(d.data[category]))
            .attr('stroke', this.highContrast ? '#000' : 'rgba(0,0,0,0.08)')
            .attr('stroke-width', 1.2)
            .style('opacity', 0.7)
            .on('mouseover', (event, d) => {
                d3.select(event.currentTarget)
                    .transition().duration(200)
                    .style('opacity', 1)
                    .attr('stroke', this.highContrast ? '#fff' : '#222')
                    .attr('stroke-width', 2);
                const cat = d.data[category];
                eventBus.dispatchEvent(new CustomEvent('selection', {
                    detail: { items: new Set([cat]), source: 'radial' }
                }));
                const val = d[1] - d[0];
                const total = d3.sum(this.data, item => item[value]);
                const percentage = ((val / total) * 100).toFixed(1);
                this.tooltip.transition().duration(200).style('opacity', 0.9)
                    .html(`
                        <strong>${cat}</strong><br>
                        Value: ${d3.format(',')(val)}<br>
                        Total: ${d3.format(',')(total)}<br>
                        Percentage: ${percentage}%
                    `);
                this.positionTooltip(event);
            })
            .on('mousemove', (event) => this.positionTooltip(event))
            .on('mouseout', (event) => {
                d3.select(event.currentTarget)
                    .transition().duration(200)
                    .style('opacity', 0.7)
                    .attr('stroke', this.highContrast ? '#000' : 'rgba(0,0,0,0.08)')
                    .attr('stroke-width', 1.2);
                this.tooltip.transition().duration(500).style('opacity', 0);
            })
            .on('click', (event, d) => {
                const cat = d.data[category];
                const newSelection = new Set(state.selectedItems);
                if (event.shiftKey || event.ctrlKey) {
                    if (newSelection.has(cat)) {
                        newSelection.delete(cat);
                    } else {
                        newSelection.add(cat);
                    }
                } else {
                    newSelection.clear();
                    newSelection.add(cat);
                }
                eventBus.dispatchEvent(new CustomEvent('selection', {
                    detail: { items: newSelection, source: 'radial' }
                }));
            });

        const labelStep = Math.ceil(this.data.length / 20);
        this.g.selectAll('.radial-label')
            .data(this.data.filter((d, i) => i % labelStep === 0))
            .join('text')
            .attr('class', 'radial-label')
            .attr('text-anchor', 'middle')
            .attr('alignment-baseline', 'middle')
            .attr('x', d => Math.sin(angleScale(d[category]) + angleScale.bandwidth() / 2) * (this.outerRadius + 15))
            .attr('y', d => -Math.cos(angleScale(d[category]) + angleScale.bandwidth() / 2) * (this.outerRadius + 15))
            .attr('font-size', '12px')
            .attr('fill', this.highContrast ? '#000' : '#222')
            .attr('font-weight', '500')
            .text(d => d[category].length > 10 ? `${d[category].slice(0, 8)}…` : d[category])
            .append('title')
            .text(d => d[category]);
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

    drawCentralLegend() {
        const keys = [this.dimensions.value];
        const legendG = this.g.append('g').attr('class', 'central-legend');
        const legendItemHeight = 12;
        const legendWidth = 150;
        const legendX = -legendWidth / 2;
        const legendY = -keys.length * legendItemHeight / 2;

        legendG.append('rect')
            .attr('x', legendX - 5)
            .attr('y', legendY - 5)
            .attr('width', legendWidth + 10)
            .attr('height', keys.length * legendItemHeight + 10)
            .attr('fill', this.highContrast ? '#fff' : '#f8f9fa')
            .attr('stroke', this.highContrast ? '#000' : '#bbb')
            .attr('stroke-width', 1)
            .attr('rx', 5)
            .attr('opacity', 0.95);

        keys.forEach((key, i) => {
            legendG.append('rect')
                .attr('x', legendX)
                .attr('y', legendY + i * legendItemHeight)
                .attr('width', 10)
                .attr('height', 10)
                .attr('fill', this.color(key));

            legendG.append('text')
                .attr('x', legendX + 16)
                .attr('y', legendY + i * legendItemHeight + 5)
                .attr('dy', '0.35em')
                .attr('font-size', '12px')
                .attr('fill', this.highContrast ? '#000' : '#222')
                .text(key.length > 20 ? `${key.slice(0, 18)}…` : key)
                .append('title')
                .text(key);
        });
    }

    updateSelection(selectedItems) {
        this.g.selectAll('.stack-layer path')
            .transition().duration(200)
            .attr('fill-opacity', d => selectedItems.size === 0 || selectedItems.has(d.data[this.dimensions.category]) ? 0.7 : 0.3)
            .attr('stroke-width', d => selectedItems.has(d.data[this.dimensions.category]) ? 2 : 1.2);
    }

    updateData(newData) {
        if (!Array.isArray(newData) || !newData.length) {
            throw new Error('Invalid data: Must be a non-empty array');
        }
        this.data = newData;
        this.initialize();
    }
}