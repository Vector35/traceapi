#!/usr/bin/env python
import psycopg2
import os
import sys
import trace_api
import subprocess
from Crypto.Hash import SHA256

binary_cache = {}
replay_cache = {}

def download_binary(api, exec_id):
	global binary_cache
	if exec_id in binary_cache:
		return binary_cache[bin_id]

	result = api.get("exec/%d/bin" % exec_id)
	if not result["ok"]:
		raise RuntimeError, "Binary for execution %d not valid" % exec_id

	downloaded = []
	for f in result["files"]:
		path = api.download(f)
		os.chmod(path, 0755)
		downloaded.append(path)

	binary_cache[exec_id] = downloaded
	return downloaded

def download_replay(api, exec_id):
	global replay_cache
	if exec_id in replay_cache:
		return replay_cache[exec_id]

	result = api.get("exec/%d/replay" % exec_id)
	if not result["ok"]:
		raise RuntimeError, "Replay %d not valid" % exec_id

	downloaded = []
	for f in result["files"]:
		path = api.download(f)
		downloaded.append(path)

	replay_cache[exec_id] = downloaded
	return downloaded

if len(sys.argv) < 2:
	print "Expected API URL"
	exit(1)

api = trace_api.TraceAPI(sys.argv[1])

workers = 1
if len(sys.argv) > 2:
	workers = int(sys.argv[2])

api_conn = psycopg2.connect("dbname=trace-api")
api_cur = api_conn.cursor()

api_cur.execute('SELECT execution FROM execution_replay GROUP BY execution')
execs = []
rows = api_cur.fetchall()
for row in rows:
	execs.append(row[0])

per_worker = (len(execs) / workers) + 1

start = 0
worker_pids = []
is_worker = False
for i in xrange(0, workers):
	pid = os.fork()
	if pid == 0:
		execs = execs[start:(start + per_worker)]
		is_worker = True
		break
	worker_pids.append(pid)
	start += per_worker

if not is_worker:
	for pid in worker_pids:
		os.waitpid(pid, 0)
	exit(0)

for i in execs:
	bins = download_binary(api, i)
	replays = download_replay(api, i)

	replay_options = []
	for replay in replays:
		replay_options += ["-replay", replay]
	p = subprocess.Popen(["./qemu-decree", "-t", "30"] + replay_options + bins, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
	out, err = p.communicate()

	if p.returncode == -6:
		sys.stdout.write(("Execution %d replayed with error:\n" % i) + out + err + "\n\n")
		sys.stdout.flush()

