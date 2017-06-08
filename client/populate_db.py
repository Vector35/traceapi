#!/usr/bin/env python
import sys
import os
import glob
import upload_cset
import upload_ref_patch
import upload_polls
import upload_ref_pov
import create_team
from itertools import (takewhile,repeat)

if len(sys.argv) < 3:
	print "Expected path to CBs"
	sys.exit(1)

server = sys.argv[1]
cset_path = sys.argv[2]

if len(sys.argv) > 3:
	cs_list = sys.argv[3].split(',')
else:
	cs_list = os.listdir(cset_path)

cb_ids = {}


def wcl(filename):
	f = open(filename,'r')
	bufgen=takewhile(lambda x: x, (f.read(1024*1024) for _ in repeat(None)))
	return sum(buf.count('\n') for buf in bufgen if buf)


# Add teams
#team_list = ['Team1', 'Team2', 'Team3', 'Team4', 'Team5', 'Team6', 'Team7']
#team_list = ['CodeJitsu', 'CSDS', 'DeepRed', 'Disekt', 'ForAllSecure', 'Shellphish', 'TECHx' ];
team_list = ['Galactica', 'Jima', 'Rubeus', 'CRSPY', 'Mayhem', 'MechaPhish', 'Xandra' ];

for team in team_list:
	create_team.create_team(server, team)

# Upload challenge sets
for cb in cs_list:
	if not os.path.exists(os.path.join(cset_path, '%s/bin' % cb)):
		continue

	if os.path.exists(os.path.join(cset_path, '%s/bin/%s' % (cb, cb))):
		bins = [os.path.join(cset_path, '%s/bin/%s' % (cb, cb))]
		patch = [os.path.join(cset_path, '%s/bin/%s_patched' % (cb, cb))]
	else:
		i = 1
		bins = []
		patch = []
		while True:
			path = os.path.join(cset_path, '%s/bin/%s_%d' % (cb, cb, i))
			if not os.path.exists(path):
				break
			bins.append(path)
			patch.append(path + "_patched")
			i += 1

	#loc
	loc = 0

	#readme
	path = os.path.join(cset_path, '%s/README.md' % cb)
	if os.path.exists(path):
		cwe = []
		readme = open(path).read()
		lines = readme.split('\n')
		shortname = lines[0].replace("--",": ").replace("_"," ")
		description = "This is the default description. It will be less than 120 characters because of word split boundaries."
		for line in lines:
			if line.split(':')[0] == "ShortDescription":
				description = line[18:]
			line = line.replace(':',' ').replace('\t', ' ').replace('.', ' ').replace('(', ' ').replace(')', ' ').replace('*', '')
			for cweline in line.split(' '):
				if cweline.startswith("CWE"):
					attempt = cweline.split('-')
					if len(attempt) == 2:
						cwe.append(int(attempt[1]))
	else:
		readme = "Empty readme"
		cwe = []
		shortname = cb
		description = "This is the default description. It will be less than 120 characters because of word split boundaries."

	path = os.path.join(cset_path, '%s/tags' % cb)
	if os.path.exists(path):
		tags = []
		lines = open(path).read().split('\n')
		for line in lines:
			if len(line) > 0:
				tags.append(line)
	else:
		tags = []

	loc = 0
	sourcefiles = []
	cwe = list(set(cwe))
	shortname = shortname.replace("# ","")

	path = os.path.join(cset_path, '%s/src' % cb)
	if os.path.exists(path):
		sourcefiles = glob.glob(path+'/*')

	path = os.path.join(cset_path, '%s/cb_1' % cb)
	if os.path.exists(path):
		sourcefiles = glob.glob(os.path.join(cset_path,cb) + "/cb_?/src/*")

	if len(sourcefiles) > 0:
		for sourcefile in sourcefiles:
			loc = loc + wcl(sourcefile)

	print "Uploading %s" % cb
	result = upload_cset.upload_cset(server, cb, bins, loc, cwe, shortname, description, readme, tags)
	cb_ids[cb] = result["csid"]
	upload_ref_patch.upload_ref_patch(server, cb_ids[cb], patch)["id"]

	polls = glob.glob(os.path.join(cset_path, '%s/poller/*/*.xml' % cb))[:32]
	upload_polls.upload_polls(server, cb_ids[cb], polls)

	povs = glob.glob(os.path.join(cset_path, '%s/pov/*.pov' % cb))
	povs += glob.glob(os.path.join(cset_path, '%s/pov/*.xml' % cb))
	for pov in povs:
		upload_ref_pov.upload_ref_pov(server, cb_ids[cb], pov)
