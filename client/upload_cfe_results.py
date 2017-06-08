#!/usr/bin/env python
import sys
import json
import os
import tarfile
import base64
import upload_pov
import upload_rcs
import cs_added
import cs_removed
import cs_score
import active_pov
import active_rcs
import active_ids
import pov_scored_result
import trace_api
import time
import random
import operator
from Crypto.Hash import *

teamMap = {'CodeJitsu':'CodeJitsu', 'CSDS':'CSDS', 'DeepRed':'DeepRed', 'Disekt':'Disekt', 'ForAllSecure':'ForAllSecure', 'Shellphish':'Shellphish', 'TECHx':'TECHx' };

def complete_round(url, round_num):
	api = trace_api.TraceAPI(url)
	result = api.post("complete/%d" % round_num, {})
	print "Completed round %d" % round_num

def is_round_complete(url, round_num):
	api = trace_api.TraceAPI(url)
	result = api.get("complete/%d" % round_num)
	return result['complete']

def get_prev_round(url, round_num):
	api = trace_api.TraceAPI(url)
	result = api.get("complete/previous/%d" % round_num)
	if not result['complete']:
		return round_num - 1
	return result['round']

def get_active_cs_list(url, round_num):
	api = trace_api.TraceAPI(url)
	result = api.get("active/%d/cs" % round_num)
	cb = []
	for i in result['cs']:
		cb.append(i['name'])
	return cb

cs_id_cache = {}
def cs_id(url, cs):
	global cs_id_cache
	if cs in cs_id_cache:
		return cs_id_cache[cs]
	api = trace_api.TraceAPI(url)
	result = api.cs_id(cs)
	cs_id_cache[cs] = result
	return result

def upload_binary_set(url, binary_contents):
	api = trace_api.TraceAPI(url)
	encoded = []
	for data in binary_contents:
		encoded.append(base64.b64encode(data))
	result = api.post("binset", {"binaries": encoded})
	return result['bsid']

def get_active_binaries(url, cs, round_num):
	api = trace_api.TraceAPI(url)
	cs = cs_id(url, cs)
	result = api.get("cs/%d/active/rcs/%d" % (cs, round_num))
	if 'rcs' not in result:
		return []
	return result['rcs']

def get_active_povs(url, cs, round_num):
	api = trace_api.TraceAPI(url)
	cs = cs_id(url, cs)
	result = api.get("cs/%d/active/pov/%d" % (cs, round_num))
	if 'pov' not in result:
		return []
	return result['pov']

def get_active_ids(url, cs, round_num):
	api = trace_api.TraceAPI(url)
	cs = cs_id(url, cs)
	result = api.get("cs/%d/active/ids/%d" % (cs, round_num))
	if 'ids' not in result:
		return []
	return result['ids']

def upload_rcs_from_bsid(url, team, cs, round_num, bsid):
	api = trace_api.TraceAPI(url)
	cs = cs_id(url, cs)
	api.post("rcs", {"team": team, "csid": cs, "round": round_num, "bsid": bsid})

def upload_pov_with_contents(url, team, cs, round_num, target, throw_count, pov):
	api = trace_api.TraceAPI(url)
	pov = base64.b64encode(pov)
	return api.post("pov", {"team": team, "csid": cs, "round": round_num, "throw_count": throw_count, "pov": pov, "submissions": [{"target": target}]})

def upload_ids_with_contents(url, team, cs, round_num, ids):
	api = trace_api.TraceAPI(url)
	ids = base64.b64encode(ids)
	return api.post("ids", {"team": team, "csid": cs, "round": round_num, "ids": ids})

def upload_rank(url, round_num, ranks):
	api = trace_api.TraceAPI(url)
	return api.post("rank/%d" % round_num, {"rank": ranks})

def get_poll_ids(url, cs, polls):
	api = trace_api.TraceAPI(url)
	return api.post("poll", {'csid': cs, 'polls': polls})['polls']

def upload_round_times(url, round, start, end):
	api = trace_api.TraceAPI(url)
	return api.post("round/%d" % round, {'start': start, 'end': end})

def upload_poll_results(url, bsid, team, round_num, polls):
	api = trace_api.TraceAPI(url)
	return api.post("result/poll", {'bsid': bsid, 'team': team, 'round': round_num, 'polls': polls})

def set_cs_reference(url, cs, bsid):
	api = trace_api.TraceAPI(url)
	cs = cs_id(url, cs)
	return api.post("cs/%d" % cs, {'bsid': bsid})

cs_mapping = {}
cs_rev_mapping = {}
def cs_map(cs):
	if cs in cs_mapping:
		return cs_mapping[cs]
	return cs
def cs_rev_map(cs):
	if cs in cs_rev_mapping:
		return cs_rev_mapping[cs]
	return cs

if len(sys.argv) < 3:
	print "Expected server URL and tar path"
	sys.exit(1)

server = sys.argv[1]

wait = False
files = sys.argv[2:]
if sys.argv[2] == "--wait":
	wait = True
	files = sys.argv[3:]

for tar_path in files:
	tar = tarfile.open(tar_path)
	rounds = []

	# Determine set of missing rounds that are in this tarball
	for f in tar.getnames():
		if f.endswith('score_data.json'):
			round_num = int(f.split('/')[0])
			if not is_round_complete(server, round_num):
				rounds.append(round_num)
	rounds.sort()

	print "Found data for round(s) %s" % ', '.join([str(i) for i in rounds])

	for round_num in rounds:
		# Extract score data from round
		scores = json.loads(tar.extractfile('%d/score_data.json' % (round_num)).read())

		# Find previous round number
		prev_round_num = get_prev_round(server, round_num)

		if "csid_map" in scores:
			cs_mapping = scores["csid_map"]
			cs_rev_mapping = {}
			for i in cs_mapping.keys():
				cs_rev_mapping[cs_mapping[i]] = i
		else:
			cs_mapping = {}
			cs_rev_mapping = {}

		# The 'challenges' list contains challenges that are no longer live, so compute
		# the set of active challenges based on scoring data instead
		active_cs_list = []
		for team in scores['teams']:
			for cs in scores['teams'][team]['scores']:
				if cs['csid'] not in active_cs_list:
					active_cs_list.append(cs['csid'])

		# Compute and upload added and removed challenges
		csadded = []
		csremoved = []
		last_cs = get_active_cs_list(server, prev_round_num)
		for cs in [cs_map(i) for i in active_cs_list]:
			if cs not in last_cs:
				csadded.append(cs)
		for cs in last_cs:
			if cs not in [cs_map(i) for i in active_cs_list]:
				csremoved.append(cs)

		for i in csadded:
			cs_added.cs_added(server, i, round_num)
		for i in csremoved:
			cs_removed.cs_removed(server, i, round_num)

		scores['rank'].sort(cmp = lambda x, y: cmp(x['rank'], y['rank']))
		upload_rank(server, round_num, scores['rank'])

		rcs_list = []
		active_bsid = {}
		active_pov_ids = []
		active_ids_rules = []
		pov_throws = []

		# Gather active binaries from last round for detection of new replacements
		last_rcs = {}
		for cs in [cs_map(i) for i in active_cs_list]:
			last_rcs[cs] = {}
			active_rcs_list = get_active_binaries(server, cs, prev_round_num)
			for rcs in active_rcs_list:
				last_rcs[cs][int(rcs['team'])] = rcs['bsid']

		# Gather active POVs from last round for detection of new POVs
		last_pov = {}
		for cs in [cs_map(i) for i in active_cs_list]:
			last_pov[cs] = {}
			active_pov_list = get_active_povs(server, cs, prev_round_num)
			for pov in active_pov_list:
				if pov['team'] not in last_pov[cs]:
					last_pov[cs][pov['team']] = {}
				last_pov[cs][pov['team']][pov['target']] = pov

		# Gather active IDS rules from last round for detection of new IDS rules
		last_ids = {}
		for cs in [cs_map(i) for i in active_cs_list]:
			last_ids[cs] = {}
			active_ids_list = get_active_ids(server, cs, prev_round_num)
			for ids in active_ids_list:
				last_ids[cs][ids['team']] = ids

		# Check for newly introduced binaries to obtain the official reference binary
		for cs in [cs_map(i) for i in active_cs_list]:
			if len(last_rcs[cs]) != 0:
				# Challenge was live in previous round, not a new one
				continue

			# All binaries should match if it is the reference binary
			bins = []
			for team in scores['teams']:
				rcs_names = scores['teams'][team]['fielded'][cs_rev_map(cs)]['rcb']
				bins.append(rcs_names)

			valid_ref = True
			for names in bins:
				if names != bins[0]:
					valid_ref = False

			if not valid_ref:
				continue

			# Upload the official reference binary
			rcs_contents = []
			for f in bins[0]:
				rcs_contents.append(tar.extractfile('files/' + f).read())

			bsid = upload_binary_set(server, rcs_contents)
			set_cs_reference(server, cs, bsid)

			# Set last_rcs to contain reference binary so that it is not marked as an RCS
			for team in scores['teams']:
				last_rcs[cs][int(team)] = bsid

		round_end_max = 0
		round_start_min = 2222222222

		for team in scores['teams']:
			# Gather score data per challenge
			if (scores['teams'][team]['round_start'] < round_start_min):
				round_start_min = scores['teams'][team]['round_start']
			if (scores['teams'][team]['round_end'] > round_end_max):
				round_end_max = scores['teams'][team]['round_end']
			cs_scores = {}
			for cs in scores['teams'][team]['scores']:
				cs_scores[cs_map(cs['csid'])] = cs

			for cs in scores['teams'][team]['feedback']['poll']:
				cs_scores[cs_map(cs['csid'])]['functionality'] = cs['functionality']
				if 'performance' in cs:
					cs_scores[cs_map(cs['csid'])]['resources'] = cs['performance']

			# Compute and upload scores
			cs_score_data = []
			for cs in cs_scores.keys():
				avail_score = cs_scores[cs]['availability']
				eval_score = cs_scores[cs]['evaluation']
				security_score = cs_scores[cs]['security']
				total_score = avail_score * eval_score * security_score
				func_score = cs_scores[cs]['functionality']['success'] / 100.0
				timeout = cs_scores[cs]['functionality']['timeout'] / 100.0
				connect_fail = cs_scores[cs]['functionality']['connect'] / 100.0
				if 'resources' in cs_scores[cs]:
					mem = cs_scores[cs]['resources']['memory'] / 100.0
					cpu = cs_scores[cs]['resources']['time'] / 100.0
				else:
					mem = 0
					cpu = 0
				if 'performance' in cs_scores[cs]:
					perf_score = cs_scores[cs]['performance']
				else:
					perf_score = 0
				file_size = 1
				cs_score_data.append([cs_id(server, cs), total_score, avail_score, func_score, timeout, connect_fail, perf_score, mem, cpu, file_size, security_score, eval_score])
			cs_score.cs_score(server, int(team), round_num, cs_score_data)

			# Upload the active RCS for each challenge
			for cs in [cs_map(i) for i in scores['teams'][team]['fielded']]:
				if cs not in cs_scores:
					continue

				rcs_names = scores['teams'][team]['fielded'][cs_rev_map(cs)]['rcb']
				rcs_contents = []
				for f in rcs_names:
					rcs_contents.append(tar.extractfile('files/' + f).read())

				bsid = upload_binary_set(server, rcs_contents)
				pending = (cs_scores[cs]['functionality']['success'] + cs_scores[cs]['functionality']['timeout'] +
					cs_scores[cs]['functionality']['connect'] + cs_scores[cs]['functionality']['function']) == 0

				pending_reason = None
				if pending:
					rcs_changed = False
					ids_changed = False

					if (cs not in last_rcs) or (int(team) not in last_rcs[cs]) or (last_rcs[cs][int(team)] != bsid):
						rcs_changed = True

					ids_contents = ""
					if 'ids' in scores['teams'][team]['fielded'][cs_rev_map(cs)]:
						ids_contents = tar.extractfile('files/' + scores['teams'][team]['fielded'][cs_rev_map(cs)]['ids']).read()
					if len(ids_contents) != 0:
						ids_hash = SHA256.new(ids_contents).hexdigest()
						if (cs not in last_ids) or (int(team) not in last_ids[cs]) or (ids_hash != last_ids[cs][int(team)]['hash']):
							ids_changed = True
					else:
						if (cs in last_ids) and (int(team) in last_ids[cs]):
							ids_changed = True

					if rcs_changed and ids_changed:
						pending_reason = "both"
					elif ids_changed:
						pending_reason = "ids"
					else:
						pending_reason = "rcs"

				rcs_list.append([team, cs_id(server, cs), bsid, pending, pending_reason])

				# Check previous round's active RCS, and add a submission if it is now different
				if (cs not in last_rcs) or (int(team) not in last_rcs[cs]) or (last_rcs[cs][int(team)] != bsid):
					upload_rcs_from_bsid(server, int(team), cs, round_num, bsid)

				if int(team) not in active_bsid:
					active_bsid[int(team)] = {}
				active_bsid[int(team)][cs] = bsid

		upload_round_times(server, round_num, round_start_min, round_end_max)


		for team in scores['teams']:
			# Gather POV throw results
			pov_throw_results = {}
			for dest_team in scores['teams']:
				if (dest_team != team) and ('pov_results' in scores['teams'][dest_team]):
					for seed in scores['teams'][dest_team]['pov_results'].keys():
						pov = scores['teams'][dest_team]['pov_results'][seed]
						if ('result' in pov) and (int(pov['team']) == int(team)):
							if pov['csid'] not in active_cs_list:
								continue
							if cs_map(pov['csid']) not in pov_throw_results:
								pov_throw_results[cs_map(pov['csid'])] = {}
							if int(dest_team) not in pov_throw_results[cs_map(pov['csid'])]:
								pov_throw_results[cs_map(pov['csid'])][int(dest_team)] = {}
							pov['seed'] = seed
							pov_throw_results[cs_map(pov['csid'])][int(dest_team)][pov['throw']] = pov

			# Upload any new POVs and IDS rules
			for cs in [cs_map(i) for i in scores['teams'][team]['fielded']]:
				if cs_rev_map(cs) not in active_cs_list:
					continue
				if 'pov' in scores['teams'][team]['fielded'][cs_rev_map(cs)]:
					for pov in scores['teams'][team]['fielded'][cs_rev_map(cs)]['pov']:
						pov_contents = tar.extractfile('files/' + pov['filename']).read()
						pov_hash = SHA256.new(pov_contents).hexdigest()
						target = int(pov['team'])
						if (cs not in last_pov) or (int(team) not in last_pov[cs]) or (target not in last_pov[cs][int(team)]) or (pov_hash != last_pov[cs][int(team)][target]['hash']) or (pov['throws'] != last_pov[cs][int(team)][target]['throw_count']):
							povid = upload_pov_with_contents(server, int(team), cs_id(server, cs), round_num, target, pov['throws'], pov_contents)['submissions'][0]
						else:
							povid = last_pov[cs][int(team)][target]['submission']
						active_pov_ids.append(povid)

						if (cs in pov_throw_results) and (target in pov_throw_results[cs]):
							for throw_num in pov_throw_results[cs][target].keys():
								result = pov_throw_results[cs][target][throw_num]
								if (target in active_bsid) and (cs in active_bsid[target]):
									pov_type = 0
									if 'pov_type' in result:
										pov_type = result['pov_type']
									pov_throws.append([povid, active_bsid[target][cs], throw_num, pov_type, result['result'] == "success", result['start_timestamp'] - scores['teams'][team]['round_start'], result['stop_timestamp'] - result['start_timestamp'], result['seed']])

				if 'ids' in scores['teams'][team]['fielded'][cs_rev_map(cs)]:
					ids_contents = tar.extractfile('files/' + scores['teams'][team]['fielded'][cs_rev_map(cs)]['ids']).read()
					if len(ids_contents) != 0:
						ids_hash = SHA256.new(ids_contents).hexdigest()
						if (cs not in last_ids) or (int(team) not in last_ids[cs]) or (ids_hash != last_ids[cs][int(team)]['hash']):
							idsid = upload_ids_with_contents(server, int(team), cs_id(server, cs), round_num, ids_contents)['submission']
						else:
							idsid = last_ids[cs][int(team)]['submission']
						active_ids_rules.append(idsid)

			# Upload poll results
			for cs in [cs_map(i) for i in scores['teams'][team]['poll_results'].keys()]:
				if scores['teams'][team]['poll_results'][cs_rev_map(cs)] == "":
					continue

				poll_seeds = scores['teams'][team]['poll_results'][cs_rev_map(cs)].keys()
				poll_upload_data = []
				for seed in poll_seeds:
					poll_upload_data.append({'seed': seed})
				poll_info = get_poll_ids(server, cs_id(server, cs), poll_upload_data)
				bsid = active_bsid[int(team)][cs]

				poll_list = []
				for i in xrange(len(poll_seeds)):
					t = poll_info[i]['time']
					if t is None:
						t = random.random() * (scores['teams'][team]['round_end'] - scores['teams'][team]['round_start'])
					duration = scores['teams'][team]['poll_results'][cs_rev_map(cs)][poll_seeds[i]]['duration']
					result = scores['teams'][team]['poll_results'][cs_rev_map(cs)][poll_seeds[i]]['result']
					poll_list.append({'id': poll_info[i]['id'], 'pass': result == "success", 'time': t, 'duration': duration})

				upload_poll_results(server, bsid, int(team), round_num, poll_list)

		active_rcs.active_rcs(server, round_num, rcs_list)
		active_pov.active_pov(server, round_num, active_pov_ids)
		active_ids.active_ids(server, round_num, active_ids_rules)
		pov_scored_result.pov_scored_result(server, round_num, pov_throws)

		complete_round(server, round_num)

	if wait:
		time.sleep(5 * 60)
