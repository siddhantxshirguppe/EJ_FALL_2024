#!/usr/bin/env python

import os.path
import json
import numpy as np
import pandas as pd

def csv_to_databuffers(filename, x, y, category, width=512, height=None,
                       xmin=None, ymin=None, xmax=None, ymax=None,
                       projection=None, catnames=False, catfilter=None,
                       catvalmin=None, catvalmax=None, catvalnum=None):
    proj = lambda x, y, inverse :  (x, y)
    root, ext = os.path.splitext(filename)
    if ext != '.csv':
        raise ValueError('Expected a .csv file, got ({}) {}'.format(ext, filename))

    # Make operation on two colums
    if '/' in x and '/' in y:
        x1 = x[:x.index('/')]
        x2 = x[x.index('/')+1:]
        y1 = y[:y.index('/')]
        y2 = y[y.index('/')+1:]
        df = pd.read_csv(filename, usecols=[x1, x2, y1, y2, category])
        df[x] = df[x1]/df[x2]
        df[y] = df[y1]/df[y2]
    if '/' in y:
        y1 = y[:y.index('/')]
        y2 = y[y.index('/')+1:]
        df = pd.read_csv(filename, usecols=[x, y1, y2, category])
        df[y] = df[y1]/df[y2]

    elif '/' in x:
        x1 = x[:x.index('/')]
        x2 = x[x.index('/')+1:]
        df = pd.read_csv(filename, usecols=[x1, x2, y, category])
        df[x] = df[x1]/df[x2]

    else :
         df = pd.read_csv(filename, usecols=[x, y, category])

    # filter the categories
    if catfilter:
        df = df[df[category].isin( catfilter.split(','))] #filter categories


    print(catvalmin)
    print(catvalmax)

    # transform a numerical data into categories
    if catvalnum:
        if catvalmin and catvalmax:
            df = df[(df[category] >= float(catvalmin)) & (df[category] <= float(catvalmax))]
        elif catvalmin:
            df = df[(df[category] >= float(catvalmin))]
        elif catvalmax:
            df = df[(df[category] <= float(catvalmax))]

        df[category] = pd.cut(df[category], int(catvalnum))


    df[category] = df[category].astype("category")
    description = {'source': {"filename": filename, "type": "csv"}}
    if projection:
        description['projection'] = {"type": projection}
        import pyproj
        proj = pyproj.Proj(init=projection, preserve_units=True)

    if xmin is None:
        xmin = df[x].min()
    if ymin is None:
        ymin = df[y].min()
    if xmax is None:
        xmax = df[x].max()
    if ymax is None:
        ymax = df[y].max()
    xy_range = [[float(xmin), float(xmax)], [float(ymin), float(ymax)]]
    if ymax == ymin or xmax == xmin:
        raise ValueError('Invalid bounds: {}'.format(xy_range))
    if height is None:
        ratio = (ymax - ymin) / (xmax - xmin)
        height = int(width * ratio)
    bins = (width, height)

    print('Range: %s, bins: %s'%(xy_range, bins))
    print('Size: %s items'%(df[x].size))

    histograms = {}
    counts = {}
    cat_column = df[category]
    values = cat_column.cat.categories

    for i, cat in enumerate(values):
        df_cat = df.loc[cat_column == cat, [x, y]]
        (histo, xedges, yedges) = np.histogram2d(df_cat[x], df_cat[y],
                                                 normed=False,
                                                 bins=bins, range=xy_range)
        if isinstance(bins, list):
            if (xedges != bins[0]).any():
                print('X Edges differ: %s'%xedges)
                bins = [xedges, yedges]
            if (yedges != bins[1]).any():
                print('Y Edges differ: %s'%yedges)
                bins = [xedges, yedges]
        else:
            bins = [xedges, yedges]
        if isinstance(cat, str):
            key = cat
        if catnames:
            key = str(cat)
        else:
            key = i+1
        histograms[key] = histo
        counts[key] = len(df_cat) + counts.get(key, 0)

    if projection:
        xmin, ymin = proj(xmin, ymin, inverse=True)
        xmax, ymax = proj(xmax, ymax, inverse=True)
        xtype = "latitude"
        ytype = "longitude"
    else:
        xtype = "quantitative"
        ytype = "quantitative"

    description['encoding'] = {
        "x": {"field": x,
              "type": xtype,
              "bin": {
                  "maxbins": width
                  },
              "aggregate": "count",
              "scale": {
                  "domain": [xmin, xmax],
                  "range": [0, width]
                  }
             },
        "y": {"field": y,
              "type": ytype,
              "bin": {
                  "maxbins": height
                  },
              "aggregate": "count",
              "scale": {
                  "domain": [ymax, ymin],
                  "range": [0, height]
                  }
             },
        "z": {"field": category,
              "type": "nominal", # or ordinal
              "scale": {
                  "domain": list(histograms.keys())
                  }
             }
        }

    print('Writing files')
    count = 0
    buffers = []
    for (key, histo) in histograms.items():
        histo = histo.T
        histo = np.flipud(histo)
        histo = histo / np.sum(histo) * 100
        hmin = np.min(histo)
        hmax = np.max(histo)
        outfile = root + '_cat_%s.json'%key
        with open(outfile, 'w') as outf:
            json.dump(histo.tolist(), outf)
        data = {'url': outfile,
                'count': counts[key],
                'value': key,
                'range': [int(hmin), int(hmax)]}
        buffers.append(data)
        count += counts[key]
    description['buffers'] = buffers
    description['source']['rows'] = count
    with open(root + '_data.json', 'w') as outf:
        json.dump(description, outf, indent=2)


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Compute heatmap from csv')
    parser.add_argument('infile',
                        help='Input csv file')
    parser.add_argument('x', help='x column name')
    parser.add_argument('y', help='y column name')
    parser.add_argument('category', help='category column name')
    parser.add_argument('--catnames', dest='catnames', action='store_false',
                        help='Force category names instead of integers')
    parser.add_argument('--width', type=int, default=512, nargs='?',
                        help='width of the binned image')
    parser.add_argument('--height', type=int, default=None, nargs='?',
                        help='height of the binned image')
    parser.add_argument('--xmin', type=float, default=None, nargs='?',
                        help='xmin of bbox')
    parser.add_argument('--ymin', type=float, default=None, nargs='?',
                        help='ymin of bbox')
    parser.add_argument('--xmax', type=float, default=None, nargs='?',
                        help='xmax of bbox')
    parser.add_argument('--ymax', type=float, default=None, nargs='?',
                        help='ymax of bbox')
    parser.add_argument('--projection', default=None, nargs='?',
                        help='Geographic projection applied to these coordinates')
    parser.add_argument('--catfilter', default=None, nargs='?',
                        help='comma separated list of categories to keep (non listed categories are discarded)')

    parser.add_argument('--catvalnum', default=None, nargs='?',
                        help='how many categories are produced from numbers)')
    parser.add_argument('--catvalmin', default=None, nargs='?',
                        help='min of values before turning them into categories)')
    parser.add_argument('--catvalmax', default=None, nargs='?',
                        help='max of values before turning them into categories')

    args = parser.parse_args()
    print('args: %s'%args)
    csv_to_databuffers(args.infile, args.x, args.y, args.category,
                       width=args.width, height=args.height,
                       xmin=args.xmin, xmax=args.xmax, ymin=args.ymin, ymax=args.ymax,
                       projection=args.projection, catfilter=args.catfilter,
                       catvalnum=args.catvalnum, catvalmin=args.catvalmin, catvalmax=args.catvalmax)
