#!/usr/bin/env python
import sys
import json
import os
import tarfile
import base64
import operator
from Crypto.Hash import *

if len(sys.argv) < 3:
	print "Expected challenge name and tar path"
	sys.exit(1)

desired_cs = sys.argv[1]

files = sys.argv[2:]

for tar_path in files:
	tar = tarfile.open(tar_path)
	rounds = []

	# Determine set of missing rounds that are in this tarball
	for f in tar.getnames():
		if f.endswith('score_data.json'):
			round_num = int(f.split('/')[0])
			rounds.append(round_num)
	rounds.sort()

	for round_num in rounds:
		# Extract score data from round
		scores = json.loads(tar.extractfile('%d/score_data.json' % (round_num)).read())

		# The 'challenges' list contains challenges that are no longer live, so compute
		# the set of active challenges based on scoring data instead
		active_cs_list = []
		for team in scores['teams']:
			for cs in scores['teams'][team]['scores']:
				if cs['csid'] not in active_cs_list:
					active_cs_list.append(cs['csid'])

		for cs in active_cs_list:
			if cs == desired_cs:
				print "Live in round %d" % round_num
				sys.exit(0)

