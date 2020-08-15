const sleep = msec => new Promise(resolve => setTimeout(resolve, msec));

drag = simulation => {

    function dragstarted(d) {
        if (!d3.event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    function dragged(d) {
        d.fx = d3.event.x;
        d.fy = d3.event.y;
    }

    function dragended(d) {
        if (!d3.event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
}

const scale = d3.scaleOrdinal(d3.schemeCategory10);


(async () => {
    // const width = 640;
    // const height = 480;
    let width = window.innerWidth
    let height = window.innerHeight - d3.select('.container').node().offsetHeight
    const data = await Promise.all([
        d3.json("./category.json"),
        d3.json("./material.json"),
        d3.json("./compound.json"),
    ])
    let category = data[0]
    let material = data[1]
    let compound = data[2]

    let nodes = new Set();
    let links = new Array();

    for (d of category) {
        d.type = "category"
        d.lookup = []
        nodes.add(d)
    }
    for (d of material) {
        d.type = "material"
        nodes.add(d)
        for (c of d["category"]) {
            links.push({source: d.name, target: c})
            category.find(d => d.name == c).lookup.push(d)
        }
        d["category"] = d["category"].map(c => category.find(d => d.name == c))
        if ("additional_category" in d)
            d["additional_category"] = d["category"].map(c => category.find(d => d.name == c))
    }
    for (d of compound) {
        d.type = "compound"
        nodes.add(d)
        for (c of d["material"])
            links.push({source: c, target: d.name})
        for (c of d["category"]) {
            links.push({source: d.name, target: c})
            category.find(d => d.name == c).lookup.push(d)
        }
        if ("additional_category" in d)
            for (c of d["additional_category"]) {
                links.push({source: d.name, target: c})
                category.find(d => d.name == c).lookup.push(d)
            }
        d["category"] = d["category"].map(c => category.find(d => d.name == c))
    }
    nodes = Array.from(nodes)
    for (d of compound) {
        d["material"] = d["material"].map(c => nodes.find(d => d.name == c))
    }

    const svg = d3.select("svg")
        .attr("viewBox", [-width / 2, -height / 2, width, height]);


    const chart = (() => {
        function myforce() {
            let nodes
            function force(alpha) {
                for (n of nodes) {
                    if (window.innerWidth > window.innerHeight) {
                        if (n.goal)
                            n.vx += alpha * 10;
                        else if (n.start)
                            n.vx -= alpha * 10;
                    } else {
                        if (n.goal)
                            n.vy += alpha * 10;
                        else if (n.start)
                            n.vy -= alpha * 10;
                    }
                }
            }
            force.initialize = function(_) {
                nodes = _
            }
            return force
        }

        const simulation = d3.forceSimulation()
        .force("charge", d3.forceManyBody())
        .force("link", d3.forceLink().id(d => d.name))
        .force("x", d3.forceX().strength(0.01))
        .force("x2", myforce())
        .force("y", d3.forceY().strength(0.01))
        .on("tick", ticked);

        let link = svg.append("g")
            .attr("stroke", "#999")
            .attr("stroke-opacity", 0.6)
            .selectAll("line");

        let node = svg.append("g")
            .attr("fill", "currentColor")
            .attr("stroke-linecap", "round")
            .attr("stroke-linejoin", "round")
            .selectAll("g")

        function ticked() {
            node.attr("transform", d => `translate(${d.x},${d.y})`);

            link.attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);
        }

        return Object.assign(svg.node(), {
            update({n1, l1}) {
                const old = new Map(node.data().map(d => [d.name, d]));
                n1 = n1.map(d => Object.assign(old.get(d.name) || {}, d));
                l1 = l1.map(d => Object.assign({}, d));

                node = node
                    .data(n1, d => d.name)
                    .join(enter => enter.append("g")
                        .call(drag(simulation))
                        .call(node => node
                            .append("circle")
                                .attr("r", 5)
                                .attr("stroke", "#fff")
                                .attr("stroke-width", 1.5)
                                .attr("fill", d => scale(d.type)))
                        .call(node => node
                            .append("text")
                                .style("font", "12px sans-serif")
                                .text(d => d.name)
                                .attr("x", 4)
                                .attr("y", "0.31em")
                            .clone(true).lower()
                                .attr("fill", "none")
                                .attr("stroke", "white")
                                .attr("stroke-width", 3))
                    )


                link = link
                    .data(l1, d => [d.source, d.target])
                    .join("line");

                simulation.nodes(n1);
                simulation.force("link").links(l1);
                simulation.alpha(1).restart().tick();
                ticked();
            }
        });
    })()

    {
        const n1 = nodes.filter(d => false);
        const l1 = links.filter(d => false);
        chart.update({n1, l1})
    }

    async function search(){
        let src = d3.select("input#src").node().value
        let dst = d3.select("input#dst").node().value

        src = nodes.find(d => d.name == src)
        dst = nodes.find(d => d.name == dst)
        if (!src || !dst) return
        console.log(`${src.name} ${dst.name}`)
        let que = [{
            item: dst,
            from: null,
            step: 0
        }]
        let memo = new Set([dst.name])
        let result = []
        while (que.length) {
            let p = que.shift()
            let m = p.item
            let t = null
            // if (p.step > 3) break
            switch(m.type) {
                case "category":
                    t = m.lookup
                    break
                case "compound":
                    t = m.material
                    break
            }
            if (!t) continue
            for (n of t) {
                if (n == src) {
                    result.push({
                        item: n,
                        from: p,
                    })
                }
                if (n.type === 'material') continue
                if (memo.has(n.name)) continue
                memo.add(n.name)
                que.push({
                    item: n,
                    from: p,
                    step: p.step + 1
                })
            }
        }

        console.log(result.length)
        if (!result.length) {
            src.start = false
            dst.start = false
            src.goal = false
            dst.goal = false
            let n1 = [dst, src]
            let l1 = []

            await chart.update({n1, l1})
            return
        }

        let n1 = new Set([dst])
        let l1 = new Set()

        for (r of result) {
            while (r.from) {
                let m = r.item
                r = r.from

                n1.add(m)
                m.start = false
                m.goal = false
                l1.add({source: m.name, target: r.item.name})
            }
        }

        n1 = Array.from(n1)
        l1 = Array.from(l1)

        src.start = true
        dst.goal = true
        dst.start = false

        console.log(n1)
        console.log(l1)

        await chart.update({n1, l1})
    }

    d3.selectAll("input").on('change', search)  
    d3.selectAll("label").on('click', function(){
        let target = d3.select(this).attr("for")
        d3.select(`#${target}`).node().value = ''
    })  
    d3.select("input#dst").on('click', search)  
    d3.select("datalist#mate_data")
        .selectAll("option")
        .data(material)
        .join("option")
        .attr("value", d => d.name)
    d3.select("datalist#comp_data")
        .selectAll("option")
        .data(category.concat(compound))
        .join("option")
        .attr("value", d => d.name)
        
})();
