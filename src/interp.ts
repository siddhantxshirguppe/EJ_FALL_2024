// Interpreter from a parsed specification

import * as Config from './config';
import DataBuffer from './data-buffer';
import ClassBuffer from './class-buffer';
import CanvasRenderer from './canvas-renderer';
import Image from './image';
import * as Tiling from './tiling';
import Tile, { TileAggregation } from './tile';
import Color from './color';
import Assembly from './assembly';
import * as Scale from './scale';
import * as util from './util';
import Mask from './mask';
import * as Weaving from './weaving';
import LegendBuilder from './legend';
import * as d3g from 'd3-geo';
import * as d3s from 'd3-selection';
import * as d3sc from 'd3-scale';
import * as d3a from 'd3-axis';
import { translate } from './util';

type ScaleLinear = {
    (value: number): number;
    domain: () => [number, number];
    range: () => [number, number];
    copy: () => ScaleLinear;
};

function customScaleLinear(domain: number[], range: [number, number]): ScaleLinear {
    // Ensure the domain array has exactly two elements, otherwise provide a default
    const [dMin, dMax] = domain.length >= 2 ? domain : [0, 100];  // Fallback domain
    const [rMin, rMax] = range;

    const scale = ((value: number): number => {
        // Normalize the input value to a 0-1 range based on the domain
        const t = (value - dMin) / (dMax - dMin);
        // Scale the normalized value to the range
        return rMin + t * (rMax - rMin);
    }) as ScaleLinear;

    // Add the domain, range, and copy methods
    scale.domain = () => [dMin, dMax];
    scale.range = () => [rMin, rMax];
    scale.copy = () => customScaleLinear([dMin, dMax], [rMin, rMax]);

    return scale;
}

export default class Interpreter {
    public description?: string;
    public width: number;
    public height: number;
    public n: number = 0;
    public schema: Config.SchemaSpec;
    public blurredBuffers: ClassBuffer[] = [];
    public classBuffers: ClassBuffer[] = [];
    public image: Image[] = [];
    public tiles: Tile[] = [];
    public tileAggregation = TileAggregation.Mean;
    public strokeCanvas: boolean = false;
    public backgroundStroke = "grey";
    public fillCanvas: boolean = true;
    public background?: string;
    public bufferNames: string[] = [];
    public colors0: Color[] = Color.Category10t;
    public colors1: Color[] = Color.Category10;
    public rebin?: Config.RebinSpec;
    public assemble: (buffers: ClassBuffer[], values: number[]) => Color = Assembly.none;

    public masks: Mask[] = [];
    public maskStroke?: string;
    public contour: Config.ContourSpec;
    public geo: Config.GeoSpec;
    public legend: Config.LegendSpec | false;
    public scale: Scale.ScaleTrait = new Scale.LinearScale([0, 1], [0, 1]);
    public xdomain: Config.NumPair;
    public ydomain: Config.NumPair;
    public stroke?: Config.StrokeSpec;
    public axis?: Config.AxisSpec;

    // d3 name of scale, used for legend
    public d3scale: string = "linear";
    public d3base: number = 10;
    public d3exponent: number = Math.E;

    log(...args: any[]) {
        if (this.debug) console.log.apply(console, args);
    }

    warn(...args: any[]) {
        if (this.debug) console.warn.apply(console, args);
    }

    error(...args: any[]) {
        if (this.debug) console.error.apply(console, args);
    }

    constructor(public config: Config.Config, public debug = false) {
        if (!config.validate())
            throw "Invalid configuration";

        this.description = config.description;
        this.width = config.width!;
        this.height = config.height!;
        this.schema = config.data!.schema!;
        this.stroke = config.stroke;
        this.axis = config.axis;

        this.geo = config.getGeo();
        this.legend = config.legend;
        this.xdomain = config.getXDomain();
        this.ydomain = config.getYDomain();

        this.rebin = config.rebin;

        if (config.contour === undefined)
            this.contour = new Config.ContourSpec();
        else
            this.contour = config.contour;
    }

    public interpret() {
        // create class buffers first
        this.classBuffers = this.config.getDataBuffers().map(dataBuffer => new ClassBuffer(dataBuffer));
        ;

        this.computePreprocess();

        // reorder, rename, and add styles
        this.computeStyle();

        // tiling
        this.computeRebin();

        // assembly
        this.computeAssembly();

        for (let tile of this.tiles) {
            tile.dataValues = tile.aggregate(this.classBuffers.map(cb => cb.dataBuffer), this.tileAggregation);
        }

        let maxCount = util.amax(this.tiles.map(tile => tile.maxValue()));

        if (this.config.scale.type === "linear")
            this.scale = new Scale.LinearScale([0, maxCount], [0, 1]);
        else if (this.config.scale.type === "sqrt")
            this.scale = new Scale.SquareRootScale([0, maxCount], [0, 1]);
        else if (this.config.scale.type === "cbrt")
            this.scale = new Scale.CubicRootScale([0, maxCount], [0, 1]);
        else if (this.config.scale.type === "log")
            this.scale = new Scale.LogScale([1, maxCount], [0, 1]);
        else if (this.config.scale.type === "equidepth") {
            let equidepth = new Scale.EquiDepthScale([0, maxCount], [0, 1], this.config.scale.levels);
            for (let tile of this.tiles)
                equidepth.addPoints(tile.dataValues);
            equidepth.computeBounds();
            this.scale = equidepth;
        }
        else
            throw `undefined rescale type: ${this.config.scale.type}`;

        this.classBuffers.forEach((cb, i) => {
            cb.colorScale = new Scale.ColorScale([cb.color0, cb.color1], this.scale);
            if (this.masks.length > i)
                cb.mask = this.masks[i];
        });
    }

    private computePreprocess() {
        if (this.config.preprocess && this.config.preprocess.gaussian) {
            this.classBuffers.forEach(cb => {
                cb.dataBuffer = cb.dataBuffer.blur(this.config.preprocess!.gaussian);
            });
        }
    }

    private computeStyle() {
        let config = this.config;

        if (config.background)
            this.background = config.background;

        if (config.style) {
            if (config.style.classes) {
                if (config.style.classes.length != this.classBuffers!.length) {
                    throw new Error(`the length of the classes does not match ${config.style.classes.length} != ${this.classBuffers!.length}`);
                }

                let buffers = config.style.classes.map(cl => {
                    let buffer = this.classBuffers!.find(cb => cb.name === cl.name);

                    if (!buffer)
                        throw new Error(`cannot find a class buffer with name ${cl}`);

                    buffer.name = cl.alias || buffer.name;
                    if (cl.color0) buffer.color0 = Color.parse(cl.color0);
                    if (cl.color1) buffer.color1 = Color.parse(cl.color1);

                    return buffer;
                })

                this.classBuffers = buffers;
            }
        }

        this.classBuffers.forEach((cb, i) => {
            if (cb.color0 == Color.None) cb.color0 = Color.White;
            if (cb.color1 == Color.None) cb.color1 = Color.Category10[i % Color.Category10.length];
        })

        this.bufferNames = this.classBuffers.map(cb => cb.name);
        this.n = this.bufferNames.length;
        this.colors0 = this.classBuffers.map(cb => cb.color0);
        this.colors1 = this.classBuffers.map(cb => cb.color1);
    }

    private computeRebin() {
        var tiles = this.tiles;
        if (this.rebin) {
            if (this.rebin!.aggregation === "max") {
                this.tileAggregation = TileAggregation.Max;
            }
            else if (this.rebin!.aggregation === "min") {
                this.tileAggregation = TileAggregation.Min;
            }
            else if (this.rebin!.aggregation === "mean") {
                this.tileAggregation = TileAggregation.Mean;
            }
            else if (this.rebin!.aggregation === "sum") {
                this.tileAggregation = TileAggregation.Sum;
            }
        }

        if (this.rebin === undefined ||
            this.rebin.type === undefined ||
            this.rebin.type == "none") {
            this.log('  Pixel rebin');
            tiles = Tiling.pixelTiling(this.width,
                this.height);
        }
        else if (this.rebin.type == "square") {
            let size = this.rebin.size || 10;
            this.log('  Square rebin size=' + size);
            tiles = Tiling.rectangularTiling(this.width,
                this.height,
                size, size);
        }
        else if (this.rebin.type == "rect") {
            let width = this.rebin.width || 10,
                height = this.rebin.height || 10;
            this.log('  Square rebin w=' + width + ' h=' + height);
            tiles = Tiling.rectangularTiling(this.width,
                this.height,
                width, height);
        }
        else if (this.rebin.type == "topojson") {
            let url = this.rebin.url,
                topojson = this.rebin.topojson,
                feature = this.rebin.feature!;
            this.log('  topojson rebin url=' + url
                + ' feature=' + feature);
            // TODO get the projection, transform, clip, etc.

            if (!topojson.objects[feature] ||
                !topojson.objects[feature].geometries ||
                !Array.isArray(topojson.objects[feature].geometries) ||
                topojson.objects[feature].geometries.length == 0) {
                throw new Error("no correct array named 'geometries' in the specified feature(" + feature + "). Is it really topojson or did you specify wrong feature name?");
            }
            //[jdf] for now, ignore min/maxfeature
            // remove unnecessary features like far islands ...
            // if (this.rebin.maxfeature != undefined && this.rebin.maxfeature > 0)
            //   topojson.objects[feature].geometries.splice(this.rebin.maxfeature,
            //                                               topojson.objects[feature].geometries.length-this.rebin.maxfeature);

            // if (this.rebin.minfeature != undefined && this.rebin.minfeature>0)
            //   topojson.objects[feature].geometries.splice(0, this.rebin.minfeature);

            let projection = this.geo.proj4 || this.geo.projection;
            tiles = Tiling.topojsonTiling(this.width, this.height,
                topojson,
                topojson.objects[feature],
                projection,
                this.geo.latitudes, this.geo.longitudes,
                (this.rebin as any).minfeature == -1);
        }
        else if (this.rebin.type == "voronoi") {
            if (this.rebin.points) {
                let points: [number, number][] = this.rebin.points;
                this.log('  voronoi rebin sites=' + points);
                tiles = Tiling.voronoiTiling(this.width,
                    this.height,
                    0, points);
            }
            else {
                let sites = this.rebin.size || 10;
                tiles = Tiling.voronoiTiling(this.width,
                    this.height,
                    sites);
            }
        }
        else if (this.rebin.type == "hexa") {
            let size = this.rebin.size || 10;
            let points: [number, number][] = [];
            for (let j = 0; j < this.height; j += size / Math.sqrt(2))
                for (let i = ((j / (size / Math.sqrt(2))) % 2) * (size / 2); i < this.width + size; i += size)
                    points.push([i, j]);

            tiles = Tiling.voronoiTiling(this.width,
                this.height,
                0, points);

        }
        if (this.rebin != undefined && this.rebin.stroke)
            this.maskStroke = this.rebin.stroke;
        this.tiles = tiles;
    }

    private computeAssembly(context = {}) {
        let assemblyConfig = this.config.assembly!;

        if (assemblyConfig.type === "max")
            this.assemble = Assembly.max;
        else if (assemblyConfig.type === "mean")
            this.assemble = Assembly.mean;
        else if (assemblyConfig.type === "invmin")
            this.assemble = Assembly.invmin;
        else if (assemblyConfig.type === "multiply")
            this.assemble = Assembly.multiply;
        else if (assemblyConfig.type === "add")
            this.assemble = Assembly.add;
        else if (assemblyConfig.type === "weaving" && assemblyConfig.shape == "square")
            this.masks = Weaving.squareMasks(this.n,
                assemblyConfig.size,
                this.width, this.height, assemblyConfig.random);
        else if (assemblyConfig.type === "weaving" && assemblyConfig.shape == "hex")
            this.masks = Weaving.hexMasks(this.n,
                assemblyConfig.size,
                this.width, this.height, assemblyConfig.random);
        else if (assemblyConfig.type === "weaving" && assemblyConfig.shape == "tri")
            this.masks = Weaving.triangleMasks(this.n,
                assemblyConfig.size,
                this.width, this.height, assemblyConfig.random);
    }

    private setup(canvas: HTMLCanvasElement, width: number, height: number) {
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        if (this.background)
            canvas.style.backgroundColor = this.background;
        if (this.description)
            canvas.setAttribute("title", this.description);
    }

    
    private renderMap(canvas: HTMLCanvasElement, wrapper: HTMLDivElement, width: number, height: number) {
        let assemblyConfig = this.config.assembly!;
        let promises = [];

        if (assemblyConfig.type === "separate") { // small multiples
            this.image = this.classBuffers.map((b) => new Image(this.width, this.height));
            for (let tile of this.tiles) {
                this.classBuffers.forEach((derivedBuffer, i) => {
                    let color = Assembly.one(derivedBuffer, tile.dataValues[i]);
                    this.image[i].render(color, tile);
                });
            }
        }
        else if (assemblyConfig.type === "time") { // time multiplexing
            this.image = this.classBuffers.map((b) => new Image(this.width, this.height));
            for (let tile of this.tiles) {
                this.classBuffers.forEach((derivedBuffer, i) => {
                    let color = Assembly.one(derivedBuffer, tile.dataValues[i]);
                    this.image[i].render(color, tile);
                });
            }
        }
        else {
            this.image = [new Image(this.width, this.height)];
        }

        // Need the tiles to compute dot density plots
        if (assemblyConfig.type === "dotdensity") {
            let size = assemblyConfig.size;

            // create one mask per databuffer
            let masks: Mask[] = this.classBuffers
                .map((buffer) => new Mask(this.width, this.height, 0));

            let areas = this.tiles.map(tile => tile.pixcount(size));
            let biggest = util.amax(areas);

            let densities = this.tiles.map((tile, i) => {
                let area = areas[i];
                return area == 0 ? 0 : tile.sumValue() / (area - 1);
            });
            let maxDensity = util.amax(densities);
            let rawMask = new Uint8Array(biggest); // max of 253 data buffers

            this.tiles.forEach(function (tile, k) {
                // create a local mask to store all the values together before dispatching
                // them in every mask for every databuffer.
                //let buffer = new ArrayBuffer(tile.mask.width*tile.mask.height);
                //let mask = Array<Uint8ClampedArray>(tile.mask.height);
                //for (let j = 0; j < tile.mask.height; j++) {
                //    mask[j] = new Uint8ClampedArray(buffer, j*tile.mask.width, tile.mask.width);
                //    mask[j].set(tile.mask.mask[j]);
                //}
                // proportion and suming
                let acc = 0;
                let pixCounts = tile.dataValues.map((v) => { acc += v / maxDensity; return acc; });

                // for every buffer we want to distribute a given number of points in its mask.
                // to do so, we create a buffer of values to distriibute among the buffer masks.
                // values 1+2 will fall where the mask of buffer#1 should display something.
                // values 2+2 will fall where the mask of buffer#2 should display something, etc.
                // values 0 and 1 already lies in the masks and mean the mask is filled or not.
                // in the end mask can only display something where there was a 1 before.
                let prev = 0;
                pixCounts.forEach((pc, j) => {
                    rawMask.fill(j + 1, prev, Math.floor(pc)); // was round??
                    prev = Math.floor(pc);
                });
                // finish with special values that will fall in no buffer in the end
                rawMask.fill(0, prev, areas[k]);

                // shuffle
                for (let i = areas[k] - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [rawMask[i], rawMask[j]] = [rawMask[j], rawMask[i]];
                }

                // dispatch the values in the straight array toward the masks (only where there are 1 in the tile's mask)
                acc = 0;
                for (let j = 0; j < tile.mask.mask.length; j += size) {
                    let row = tile.mask.mask[j];
                    for (let i = 0, w = tile.mask.mask[j].length; i < w; i += size) {
                        if (row[i] > 0) {
                            let id = rawMask[acc++];
                            if (id > 0)
                                for (let dj = 0; dj < size && j + dj + tile.y < masks[id - 1].mask.length; dj++)
                                    masks[id - 1].mask[j + dj + tile.y].fill(1, i + tile.x, i + tile.x + size);
                        }
                    }
                }

            });

            for (let tile of this.tiles) {
                this.classBuffers.forEach((derivedBuffer, i) => {
                    //let color = derivedBuffer.colorScale.map(tile.dataValues[i]);
                    let color = derivedBuffer.colorScale.colorRange[1]
                    this.image[0].render(color, tile, masks[i]);
                });
            }
        }

        if (this.assemble == Assembly.invmin) {
            for (let tile of this.tiles) {
                let color = Assembly.invmin(this.classBuffers, tile.dataValues, assemblyConfig.threshold);
                this.image[0].render(color, tile);
            }
        }
        else if (this.assemble != Assembly.none) {
            for (let tile of this.tiles) {
                let color = this.assemble(this.classBuffers, tile.dataValues);
                this.image[0].render(color, tile);
            }
        }
        else if (this.masks.length > 0) { // no composer
            for (let tile of this.tiles) {
                this.classBuffers.forEach((derivedBuffer, i) => {
                    let color = derivedBuffer.colorScale.map(tile.dataValues[i]);
                    this.image[0].render(color, tile, derivedBuffer.mask);
                });
            }
        }
        else if (assemblyConfig.type === "propline") {
            for (let tile of this.tiles) {
                let hatch = Assembly.hatch(tile, this.classBuffers, tile.dataValues, {
                    thickness: assemblyConfig.size,
                    sort: assemblyConfig.sort,
                    widthprop: assemblyConfig.widthprop,
                    colprop: assemblyConfig.colprop
                });

                this.image[0].render(hatch, tile.center);
            }
        }
        else if (assemblyConfig.type === "hatching") {
            let maxCount = util.amax(this.tiles.map(tile => tile.maxValue()));
            this.classBuffers.forEach((derivedBuffer: ClassBuffer, i: number) => {
                // Ugly side effect, should pass dataValues to Composer.hatch instead
                derivedBuffer.angle = Math.PI * i / (2 * this.classBuffers.length);
            });

            for (let tile of this.tiles) {
                let hatch: HTMLCanvasElement;

                if (typeof assemblyConfig.widthprop === "number")
                    hatch = Assembly.hatch(tile, this.classBuffers, tile.dataValues, {
                        thickness: assemblyConfig.size,
                        sort: assemblyConfig.sort,
                        widthprop: assemblyConfig.widthprop * maxCount,
                        colprop: assemblyConfig.colprop
                    });
                else
                    hatch = Assembly.hatch(tile, this.classBuffers, tile.dataValues, {
                        thickness: assemblyConfig.size,
                        sort: assemblyConfig.sort,
                        widthprop: assemblyConfig.widthprop,
                        colprop: assemblyConfig.colprop
                    });

                this.image[0].render(hatch, tile.center);
            }
        }
        else if (assemblyConfig.type === "glyph") {
            let maxCount = util.amax(this.tiles.map(tile => tile.maxValue()));
            let glyphSpec = assemblyConfig.glyphSpec!;

            let d3scale, d3base = 1, d3exponent = Math.E;
            if (this.scale instanceof Scale.LinearScale) {
                d3scale = 'linear';
            }
            else if (this.scale instanceof Scale.LogScale) {
                d3scale = 'log';
                d3base = (<Scale.LogScale>this.scale).base;
            }
            else if (this.scale instanceof Scale.RootScale) {
                d3scale = 'pow';
                d3exponent = 1 / this.scale.degree;
            }
            else {
                throw 'failed to convert a scale to a d3 scale. Please add a specification';
            }

            this.d3base = d3base;
            this.d3scale = d3scale;
            this.d3exponent = d3exponent;

            if (glyphSpec.template === "bars") {
                let width = glyphSpec.width; // tile.mask.width;
                let height = glyphSpec.height; // tile.mask.height;

                for (let tile of this.tiles) {
                    if (tile.mask.width < width
                        || tile.mask.height < height) continue;

                    let promise = Assembly.bars(this.classBuffers, tile.dataValues, {
                        width: glyphSpec.width,
                        height: glyphSpec.height,
                        'y.scale.domain': this.scale.domain as [number, number],
                        'y.scale.type': d3scale,
                        'y.scale.base': d3base,
                        'y.scale.exponent': d3exponent
                    }).then((vegaCanvas) => {
                        let rect = tile.getRectAtCenter();
                        if (!rect || rect.width() < width || rect.height() < height) return;

                        this.image[0].render(vegaCanvas, rect.center(), {
                            width: width,
                            height: height
                        });
                    })

                    promises.push(promise);
                }
            }
            else if (glyphSpec.template === "punchcard") {
                for (let tile of this.tiles) {
                    let width = glyphSpec.width; // tile.mask.width;
                    let height = glyphSpec.height; // tile.mask.height;

                    // this.log('mask', width, height);

                    let promise = Assembly.punchcard(this.classBuffers, this.bufferNames, tile.dataValues, {
                        width: width,
                        height: height,
                        'z.scale.domain': this.scale.domain as [number, number],
                        'z.scale.type': d3scale,
                        'z.scale.base': d3base,
                        cols: Math.ceil(Math.sqrt(this.classBuffers.length)),
                        factor: glyphSpec.factor
                    }).then((vegaCanvas) => {
                        // this.log('canvas', vegaCanvas.width, vegaCanvas.height);
                        let rect = tile.getRectAtCenter();

                        if (!rect || rect.width() < width || rect.height() < height) return;

                        this.image[0].render(vegaCanvas, rect.center(), {
                            width: width,
                            height: height,
                        });
                    })

                    promises.push(promise);
                }
            }
        }
        else
            this.log('No assembly');

        let render = () => {
            let options: any = {};

            if (assemblyConfig.type === "time") {
                options.interval = assemblyConfig.duration;
                options.wrapper = wrapper;
            }

            let ctx = CanvasRenderer.renderAll(this.image, canvas, width, height, assemblyConfig.order, options);
            // TODO: adding strokes does not work with time multiplexing

            if (this.contour.stroke > 0) {
                // Assume all the scales are shared between derived buffers
                let path = d3g.geoPath(null, ctx),
                    thresholds = this.classBuffers[0].thresholds(this.contour.stroke);

                ctx.strokeStyle = 'black';

                let minStretch = Infinity;
                this.classBuffers.forEach((cb, k) => {
                    let loop0 = cb.dataBuffer.max();
                    let blurred = cb.dataBuffer.blur(this.contour.blur)

                    // TODO jaemin will improve
                    cb.dataBuffer = blurred;
                    this.blurredBuffers[k] = cb;
                    let loop1 = this.blurredBuffers[k].dataBuffer.max();
                    minStretch = Math.min(minStretch, loop0 / loop1);
                });

                this.blurredBuffers.forEach((blurredBuffer, k) => {
                    blurredBuffer.dataBuffer.rescale(minStretch);
                });

                this.blurredBuffers.forEach((blurredBuffer, k) => {
                    let locthresholds = blurredBuffer.thresholds(this.contour.stroke);
                    let geometries = blurredBuffer.contours(locthresholds, this.contour.blur),
                        colors = locthresholds.map(v => blurredBuffer.colorScale.colorRange[1]);
                    if (this.contour.colprop)
                        colors = thresholds.map(v => blurredBuffer.colorScale.map(v));

                    geometries.forEach((geo: any, k: number) => {
                        ctx.beginPath();
                        path(geo);
                        ctx.strokeStyle = colors[k].css();
                        ctx.lineWidth = this.contour.lineWidth;
                        ctx.stroke();
                    });
                });
            }

            if (this.maskStroke)
                for (let tile of this.tiles)
                    CanvasRenderer.strokeVectorMask(tile.mask, canvas, { color: this.maskStroke });
        };
        if (promises.length > 0) Promise.all(promises).then(render);
        else render();
    }

    render(id: string | HTMLDivElement, forcedWidth?: number, forcedHeight?: number) {
        let wrapper: HTMLDivElement;

        if (typeof id === "string") wrapper = <HTMLDivElement>document.getElementById(id);
        else wrapper = id;

        let mapCanvas: HTMLCanvasElement = document.createElement("canvas"),
            axisSVG: SVGSVGElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");

        let width = forcedWidth || this.width;
        let height = forcedHeight || this.height;

        axisSVG.style.verticalAlign = "top";
        mapCanvas.style.verticalAlign = "top";

        if (this.axis) {
            let pack = document.createElement("div");

            pack.style.display = "inline-block";
            pack.style.position = "relative";

            pack.appendChild(axisSVG);
            pack.appendChild(mapCanvas);

            pack.style.verticalAlign = "top";

            wrapper.appendChild(pack);
        }
        else {
            wrapper.appendChild(mapCanvas);
        }

        this.setup(mapCanvas, width, height);
        this.renderMap(mapCanvas, wrapper, width, height);

        if (this.legend !== false) {
            let legend = document.createElement("div");

            legend.style.display = "inline-block";
            legend.style.position = "relative";

            wrapper.appendChild(legend);
            LegendBuilder(legend, this);
        }

        if (this.axis) {
            this.renderAxis(mapCanvas, axisSVG, forcedWidth, forcedHeight);
        }

        if (this.stroke) this.renderStroke(mapCanvas);
    }

    
    private renderAxis(map: HTMLCanvasElement, native: SVGSVGElement, forcedWidth?: number, forcedHeight?: number) {
        let svg: any = d3s.select(native);
        let margin = {
            left: this.axis!.marginLeft,
            bottom: this.axis!.marginBottom,
            right: this.axis!.marginRight,
            top: this.axis!.marginTop
        };

        map.style.position = "absolute";
        map.style.left = margin.left + "px";
        map.style.top = margin.top + "px";

        let width = forcedWidth || this.width;
        let height = forcedHeight || this.height;

        svg
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom);

        let xAxisG = svg.append('g').attr('transform', translate(margin.left, margin.top + height));
        //let x = d3sc.scaleLinear().domain(this.xdomain).range([0, width]);
        //xAxisG.call(d3a.axisBottom(x));

        let yAxisG = svg.append('g').attr('transform', translate(margin.left, margin.top));
        //let y = d3sc.scaleLinear().domain(this.ydomain).range([0, height]);
        //yAxisG.call(d3a.axisLeft(y));


        const fallbackXDomain = [0, 100];  // Fallback domain for x-axis
        const fallbackYDomain = [0, 100];  // Fallback domain for y-axis

        let xDomain = (this.xdomain && this.xdomain.length >= 2) ? this.xdomain : fallbackXDomain;
        let yDomain = (this.ydomain && this.ydomain.length >= 2) ? this.ydomain : fallbackYDomain;

        //let x = d3sc.scaleLinear().domain(xDomain).range([0, width]);
        //let y = d3sc.scaleLinear().domain(yDomain).range([0, height]);

        let x = customScaleLinear(xDomain, [0, width]);
        let y = customScaleLinear(yDomain, [0, height]);

        xAxisG.call(d3a.axisBottom(x));
        yAxisG.call(d3a.axisLeft(y));


        let xTitle = this.schema.encoding!.x.field;
        let yTitle = this.schema.encoding!.y.field;

        if (this.axis!.x && this.axis!.x!.title) xTitle = this.axis!.x!.title!;
        if (this.axis!.y && this.axis!.y!.title) yTitle = this.axis!.y!.title!;

        svg.append('text')
            .attr('transform', translate(width / 2 + margin.left, margin.top + height + margin.bottom))
            .style('font-size', '11px')
            .style('font-family', 'sans-serif')
            .attr('text-anchor', 'middle')
            .attr('dy', '-.5em')
            .style('font-weight', 'bold')
            .text(xTitle)

        svg.append('text')
            .attr("transform", translate(0, margin.top + height / 2) + "rotate(-90)")
            .attr("dy", ".71em")
            .attr("y", "3px")
            .style('font-size', '11px')
            .style('font-family', 'sans-serif')
            .style("text-anchor", "middle")
            .style('font-weight', 'bold')
            .text(yTitle);
    }

    private renderStroke(canvas: HTMLCanvasElement | string) {
        let stroke = this.stroke!;

        let url = stroke.url,
            topojson = stroke.topojson,
            feature = stroke.feature; //CHECK

        this.log(`topojson stroke url=${url} feature=${feature}`);
        // TODO get the projection, transform, clip, etc.

        if (!topojson.objects[feature] ||
            !topojson.objects[feature].geometries ||
            !Array.isArray(topojson.objects[feature].geometries) ||
            topojson.objects[feature].geometries.length === 0) {
            throw new Error("no correct array named 'geometries' in the specified feature(" + feature + "). Is it really topojson or did you specify wrong feature name?");
        }

        let projection = this.geo.proj4 || this.geo.projection;
        let tiles = Tiling.topojsonTiling(this.width, this.height,
            topojson,
            topojson.objects[feature],
            projection,
            this.geo.latitudes, this.geo.longitudes);

        for (let tile of tiles)
            CanvasRenderer.strokeVectorMask(tile.mask, canvas, { color: stroke.color, lineWidth: stroke.lineWidth });

    }

    pickDomains(x: number, y: number): [number, number] | null {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height)
            return null;
        return [util.linterp(this.xdomain[0], this.xdomain[1], x / this.width),
        util.linterp(this.ydomain[0], this.ydomain[1], y / this.height)];
    }

    pickValues(x: number, y: number): number[] {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height)
            return [];
        return this.classBuffers.map(cb => cb.dataBuffer.values[y][x]);
    }

    pickTile(x: number, y: number): Tile | null {
        if (this.tiles.length == 0 ||
            x < 0 || x >= this.width || y < 0 || y >= this.height)
            return null;

        var tile: Tile | null = null;

        if (this.rebin === undefined ||
            this.rebin.type === undefined ||
            this.rebin.type == "none") {
            tile = this.tiles[this.width * y + x];
        }
        else if (this.rebin.type == "square") {
            let size = this.rebin.size || 10;
            x = Math.floor(x / size);
            y = Math.floor(y / size);
            tile = this.tiles[Math.floor(this.width / size) * y + x];
        }
        else if (this.rebin.type == "rect") {
            let width = this.rebin.width || 10,
                height = this.rebin.height || 10;
            x = Math.floor(x / width);
            y = Math.floor(y / height);
            tile = this.tiles[Math.floor(this.width / width) * y + x];
        }
        else {
            for (let t of this.tiles)
                if (t.contains(x, y)) {
                    tile = t;
                    break;
                }
        }
        return tile;
    }
}

