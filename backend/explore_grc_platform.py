"""
Scratch script: load GNU Radio's block library through GRC's own Platform
class and list the attributes that hold blocks, as a possible replacement
for the YAML parsing in get_grc_block_info.py.
"""
import os
import sys

import gnuradio
from gnuradio.grc.core.platform import Platform
from gnuradio import gr 


v = gr.version()
platform = Platform(v)

with open(os.devnull, 'w') as fnull:
    # Save the original stderr
    original_stderr = sys.stderr
    try:
        sys.stderr = fnull
        platform.build_library(path='/usr/share/gnuradio/grc/blocks')
    finally:
        # Restore stderr so you still see your own errors later
        sys.stderr = original_stderr

for attr in dir(platform):
    if 'block' in attr.lower() or 'lib' in attr.lower():
        val = getattr(platform, attr)
        print(f"Attribute: {attr} | Type: {type(val)}")