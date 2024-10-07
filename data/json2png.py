#!/usr/bin/env python

import os.path
import json
import gzip
import numpy as np
from PIL import Image
#from scipy.misc import toimage
from scipy.special import cbrt

def json2png(fname):
    root, ext = os.path.splitext(fname)
    fopen = open
    if ext == '.gz':
        fopen = gzip.open
        root, ext = os.path.splitext(root)
    if ext != '.json':
        raise ValueError('Not a json file (%s): %s'%(ext, fname))
    with fopen(fname, 'r') as injson:
        histo = np.array(json.load(injson))


    print("histo shape:",histo.shape)

    histo = cbrt(histo)

    height, width = histo.shape
    print("before Height:", height)
    print("before Width:", width)
    histo = histo.astype(np.int8)
    #image = toimage(histo, high=65536, low=0, mode='I')
    # image = image.transpose(Image.FLIP_TOP_BOTTOM)
    image = Image.fromarray(histo.astype(np.uint8), mode='I')
    image.save(root+'.png', format='PNG')

if __name__ == '__main__':
    import sys
    for arg in sys.argv[1:]:
        json2png(arg)
