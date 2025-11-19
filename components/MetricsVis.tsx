import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { WorkflowStep, StepStatus } from '../types';

interface Props {
  steps: WorkflowStep[];
}

/**
 * MetricsVis Component - Displays performance metrics as a D3 bar chart
 * Shows latency in milliseconds for each completed workflow step
 */
const MetricsVis: React.FC<Props> = ({ steps }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    // Use enum for type safety
    const completedSteps = steps.filter(s => s.status === StepStatus.COMPLETED && s.latency);

    if (completedSteps.length === 0) {
      // Clear chart if no data
      d3.select(svgRef.current).selectAll("*").remove();
      return;
    }

    const containerWidth = containerRef.current.clientWidth || 300;
    const height = 150;
    const margin = { top: 20, right: 20, bottom: 30, left: 45 };

    const svg = d3.select(svgRef.current);

    // More efficient update: only clear if necessary
    const existingGroups = svg.select('g.chart-group');
    if (existingGroups.empty()) {
      svg.selectAll("*").remove();
    } else {
      // Clear only chart elements, not structure
      existingGroups.selectAll("*").remove();
    }

    const width = Math.max(containerWidth - margin.left - margin.right, 100);

    const x = d3.scaleBand()
      .range([0, width])
      .padding(0.2)
      .domain(completedSteps.map((d, i) => `Step ${i + 1}`));

    const y = d3.scaleLinear()
      .range([height, 0])
      .domain([0, d3.max(completedSteps, d => d.latency || 0) || 1000]);

    // Reuse or create chart group
    let g = svg.select<SVGGElement>('g.chart-group');
    if (g.empty()) {
      g = svg.append<SVGGElement>("g")
        .attr("class", "chart-group")
        .attr("transform", `translate(${margin.left},${margin.top})`);
    }

    // Bars
    g.selectAll(".bar")
      .data(completedSteps)
      .enter().append("rect")
      .attr("class", "bar")
      .attr("x", (d, i) => x(`Step ${i + 1}`)!)
      .attr("width", x.bandwidth())
      .attr("y", d => y(d.latency || 0))
      .attr("height", d => height - y(d.latency || 0))
      .attr("fill", "#3b82f6")
      .attr("rx", 4);

    // X Axis
    g.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .attr("class", "text-xs text-slate-400")
      .style("text-anchor", "middle");

    // Y Axis
    g.append("g")
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => `${d}ms`))
      .selectAll("text")
      .attr("class", "text-xs text-slate-400");
      
    // Title
    svg.append("text")
        .attr("x", width / 2 + margin.left)
        .attr("y", 15)
        .attr("text-anchor", "middle")
        .style("font-size", "10px")
        .style("fill", "#94a3b8")
        .text("Processing Latency per Step");

  }, [steps]);

  return (
    <div className="w-full bg-slate-900/50 border border-slate-800 rounded-lg p-4 mt-4">
      <h3 className="text-xs font-semibold uppercase text-slate-500 mb-2">Performance Metrics</h3>
      <div ref={containerRef} className="w-full h-[160px]">
         <svg ref={svgRef} width="100%" height="100%"></svg>
      </div>
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export default React.memo(MetricsVis, (prevProps, nextProps) => {
  // Only re-render if completed steps or their latencies changed
  const prevCompleted = prevProps.steps.filter(s => s.status === StepStatus.COMPLETED && s.latency);
  const nextCompleted = nextProps.steps.filter(s => s.status === StepStatus.COMPLETED && s.latency);

  if (prevCompleted.length !== nextCompleted.length) return false;

  return prevCompleted.every((step, i) =>
    step.latency === nextCompleted[i].latency && step.id === nextCompleted[i].id
  );
});