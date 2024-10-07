import Point from './point';
import DataBuffer from './data-buffer';
import Mask from './mask';
import Color from './color';
import Rect from './rect';
import * as util from './util';

export enum TileAggregation {
    Min,
    Mean,
    Sum,
    Max
}

export default class Tile extends Point {
    dataValues: number[] = [];

    constructor(x: number, y: number, public mask: Mask,
        public center: Point = new Point(x + mask.width / 2, y + mask.height / 2)) {
        super(x, y);
    }

    area() { return this.mask.area(); }
    rowcounts() { return this.mask.rowcounts(); }
    pixcount(step: number = 1) { return this.mask.pixcount(step); }
    maxValue() { return util.amax(this.dataValues); }
    sumValue() { return util.asum(this.dataValues); }

    contains(x: number, y: number) {
        if (x < this.x ||
            y < this.y ||
            x >= (this.x + this.mask.width) ||
            y >= (this.y + this.mask.height))
            return false;
        return this.mask.mask[y - this.y][x - this.x] != 0;
    }

    aggregateOne(buffer: DataBuffer, op: TileAggregation = TileAggregation.Mean): number {
        let val = 0;
        let cnt = 0;
        let r0 = Math.ceil(this.y);
        let c0 = Math.ceil(this.x);
        let rmax = Math.min(this.y + this.mask.height, buffer.height);
        let cmax = Math.min(this.x + this.mask.width, buffer.width);

        for (let r = r0; r < rmax; r++) {
            let row = buffer.values[r];
            let mrow = this.mask.mask[r - r0];
            for (let c = c0; c < cmax; c++) {
                if (mrow[c - c0] == 0) continue;
                if (cnt == 0)
                    val = row[c];
                else {
                    let current = row[c];
                    switch (op) {
                        case TileAggregation.Min:
                            if (current == 0) continue;
                            if (val == 0)
                                val = current;
                            else
                                val = Math.min(val, current);
                            break;
                        case TileAggregation.Mean:
                        case TileAggregation.Sum:
                            val += current;
                            break;
                        case TileAggregation.Max:
                            val = Math.max(val, current);
                            break;
                    }
                }
                cnt++;
            }
        }

        if (op === TileAggregation.Mean && cnt > 0) {
            val /= cnt;
        }

        return val;
    }


    aggregate(buffers: DataBuffer[], op: TileAggregation = TileAggregation.Mean): number[] {
        // Just one thing to aggregate ? let's return it
        if (this.mask.height == 1 && this.mask.width == 1)
            return buffers.map(buffer => buffer.values[Math.ceil(this.y)][Math.ceil(this.x)]);
        else
            return buffers.map(buffer => this.aggregateOne(buffer, op));
    }

    getRectAtCenter() {
        if (this.mask && this.mask.path != undefined) {
            let poly: [number, number][] = this.mask.path.pts;

            let center = util.largeRectInPoly(poly, {
                angle: 0,
                aspectRatio: 1,
                nTries: 100
            });

            if (!center) {
                return null;
            }

            let p = center[0]! as { cx: number, cy: number, width: number, height: number };
            return new Rect(
                new Point(p.cx - p.width / 2, p.cy - p.height / 2),
                new Point(p.cx + p.width / 2, p.cy + p.height / 2)
            );
        }

        return new Rect(
            new Point(this.x, this.y),
            new Point(this.x + this.mask.width, this.y + this.mask.height)
        );
    }
}
