import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { WorkflowStep } from '../types';

interface Props {
  steps: WorkflowStep[];
}

const MetricsVis: React.FC<Props> = ({ steps }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || steps.length === 0) return;

    const completedSteps = steps.filter(s => s.status === 'COMPLETED' && s.latency);
    if (completedSteps.length === 0) return;

    const containerWidth = svgRef.current.parentElement?.clientWidth || 300;
    const height = 150;
    const margin = { top: 20, right: 20, bottom: 30, left: 40 };

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = containerWidth - margin.left - margin.right;

    const x = d3.scaleBand()
      .range([0, width])
      .padding(0.2)
      .domain(completedSteps.map((d, i) => `Step ${i + 1}`));

    const y = d3.scaleLinear()
      .range([height, 0])
      .domain([0, d3.max(completedSteps, d => d.latency || 0) || 1000]);

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

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
      <div className="w-full h-[160px]">
         <svg ref={svgRef} width="100%" height="100%"></svg>
      </div>
    </div>
  );
};

export default MetricsVis;