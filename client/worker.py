#!/usr/bin/env python
import trace_api
import sys
import json
import os
import time
import subprocess
import base64
import struct
import logging
import qemu_cb_test
import analysis
import gzip
import StringIO
import errno
import traceback
from Crypto.Hash import SHA256
from Crypto.Hash import SHA384
import glob
import math
from collections import Counter
from itertools import (takewhile,repeat)
import ElfFile
import BinaryData
import Crypto.Random
import threading

#this code requires a binaryninja license
#sys.path.insert(0, os.environ['HOME']+'/binaryninja/python')
#import binaryninja


REPLAY_VERSION = 7
REPLAY_FLAG_POV_TYPE_1 = 8
REPLAY_FLAG_POV_TYPE_2 = 0x10

binary_cache = {}
replay_cache = {}
ids_cache = {}

worker_id = Crypto.Random.get_random_bytes(8).encode("hex")

class WorkerHeartbeatThread(threading.Thread):
	def __init__(self, api):
		threading.Thread.__init__(self)
		self.api = api
		self.daemon = True

	def run(self):
		global worker_id
		while True:
			time.sleep(10)
			self.api.get("work/%s/heartbeat" % worker_id)

def hash(data):
	return SHA256.new(str(data)).hexdigest()

def entropy(data):
	counter = Counter(data)
	lns = float(len(data))
	return -sum(count/lns * math.log(count/lns,2) for count in counter.values())

def byte_histogram(data):
	counts = [0]*256
	for byte in data:
		index=ord(byte)
		counts[index] = counts[index]+1
	return counts

def sections(data):
	program_header_lookup = { 0: "PT_NULL", 1:"PT_LOAD", 2:"PT_DYNAMIC", 3: "PT_INTERP", 4: "PT_NOTE", 5: "PT_SHLIB", 6: "PT_PHDR", 7: "PT_TLS" }
	headers = []
	binaryFile = BinaryData.BinaryFile(data)
	elf = ElfFile.ElfFile(binaryFile)
	for header in elf.program_headers:
		flags = ""
		if header.flags & 4 == 4:
			flags += "READ "
		if header.flags & 2 == 2:
			flags += "WRITE "
		if header.flags & 1 == 1:
			flags += "EXEC "
		if header.flags & 0xfffffff8 != 0:
			flags += "INVALID"
			#Create story here.
		if header.type in dict(program_header_lookup):
			prgtype = program_header_lookup[header.type]
		else:
			prgtype = "INVALID TYPE"
			#Create story here.
		headers.append({"file_size":header.file_size,"memory_size":header.memory_size,"flags":flags,"type":prgtype})
	return headers

def opcode_histogram(bv):
        opcodes = {}
        return opcodes
        # this code requires binary ninja, disabled for now
        for fn in bv.functions:
            for block in fn.basic_blocks:
                for insn in block:
                    text = insn[0][0].text.strip()
                    if text in opcodes:
                        opcodes[text] += 1
                    else:
                        opcodes[text] = 1
	return opcodes

def functions(bv):
        return "[[0,0,0,0]]"
        # this code requires binary ninja
	# start (decimal), end (decimal), incoming edges, outgoing edges
	result = '['
	for func in bv.functions:
		outgoing = 0
		try:
			for block in func.low_level_il:
				for il in block:
					if il.operation == binaryninja.core.LLIL_CALL:
						outgoing += 1
			end = func.basic_blocks[-1].end #Not sure if guaranteed, need func.end
		except:
			print "Exception handling " + bv.file.filename
			end = func.start
		#TODO: Properly calculate function size instead of this hack
		#TODO: Properly count incoming via xref API
		#TODO: Faster call calculation maybe?
		result += "[%d,%d,%d,%d]" % (func.start, end, 0, outgoing)
	return result+"]"

def blocks(bv):
	#TODO: optimize
	#Will likely be really slow, off for now
	# start (decimal), end (decimal)
	return "[[0,0]]"

def compress_data(data):
	s = StringIO.StringIO()
	gz = gzip.GzipFile(mode='wb', fileobj=s)
	gz.write(data)
	gz.close()
	return s.getvalue()

def download_binary(api, bin_id):
	global binary_cache
	if bin_id in binary_cache:
		return binary_cache[bin_id]

	result = api.get("binset/%d" % bin_id)
	if not result["ok"]:
		raise RuntimeError, "Binary %d not valid" % bin_id

	downloaded = []
	for f in result["files"]:
		path = api.download(f)
		os.chmod(path, 0755)
		downloaded.append(path)

	binary_cache[bin_id] = downloaded
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

def download_ids(api, ids_id):
	global ids_cache
	if ids_id in ids_cache:
		return ids_cache[ids_id]

	result = api.get("ids/%s" % ids_id)
	if not result["ok"]:
		raise RuntimeError, "IDS %d not valid" % ids_id

	path = api.download(result["file"])
	ids_cache[ids_id] = path
	return path

def get_replay_list(bin_files, replay_prefix, inputname):
	replays = []
	for path in bin_files:
		filename = os.path.basename(path)
		replayfile = replay_prefix + "-" + inputname + "-" + filename + ".replay"
		replays.append(replayfile)
	return replays

def get_pov_type_from_replay(replay_prefix, inputname):
	try:
		f = open(replay_prefix + "-" + inputname + ".pov.replay", 'rb')

		# Read replay header, which contains performance data
		magic, ver, bin_count, bin_id, flags, pages, sig, reserved, insn_count = struct.unpack("<IHHHHIIIQ", f.read(32))
		f.close()

		if magic != 0xbd46f4dd:
			print "Invalid replay file header"
			return 0
		if ver != REPLAY_VERSION:
			print "Replay file version mismatch (was %d, expected %d)" % (ver, REPLAY_VERSION)
			return 0

		if (flags & REPLAY_FLAG_POV_TYPE_1) != 0:
			return 1
		elif (flags & REPLAY_FLAG_POV_TYPE_2) != 0:
			return 2
	except:
		print "Unable to read flags in PoV replay"
	return 0

def gen_replay_prefix(name):
	return "%s_%s" % (name, Crypto.Random.get_random_bytes(16).encode("hex"))

def get_replay_data(replays, compressed=True):
	replay_data = []
	for path in replays:
		if not os.path.exists(path):
			print "Replay '%s' not found" % path
			replay_data.append(base64.b64encode(""))
		elif compressed:
			replay_data.append(base64.b64encode(compress_data(open(path, "rb").read())))
			os.unlink(path)
		else:
			replay_data.append(base64.b64encode(open(path, "rb").read()))
			os.unlink(path)
	return replay_data

def get_perf_info(bin_files, replay_prefix, replays):
	mem_usage = 0
	cpu_usage = 0

	try:
		for replay in replays:
			f = open(replay, 'rb')

			# Read replay header, which contains performance data
			magic, ver, bin_count, bin_id, flags, pages, sig, reserved, insn_count = struct.unpack("<IHHHHIIIQ", f.read(32))
			f.close()

			if magic != 0xbd46f4dd:
				print "Invalid replay file header"
				break
			if ver != REPLAY_VERSION:
				print "Replay file version mismatch (was %d, expected %d)" % (ver, REPLAY_VERSION)
				break

			mem_usage += pages
			cpu_usage += insn_count
	except:
		print "Performance data could not be read from the replay"

	return mem_usage, cpu_usage

def do_bin_stats(api, work):
	global work_dir, logger
	bin_id = work["bin_id"]
	bin_hash = work["hash"]

	print "Statistics for binary id %s with name %s" % (bin_id, bin_hash)

	path = api.download(bin_hash)
	binary = open(path).read()

        #this code requires a binaryninja license
	#bv = binaryninja.BinaryViewType['ELF'].open(path)
	#bv.update_analysis_and_wait()

	data = {
		"bin_id": bin_id,
		"bin_hash": bin_hash,
		"entropy": entropy(binary),
		"byte_histogram": byte_histogram(binary),
		"sections": sections(binary),
		"opcode_histogram": opcode_histogram("bv"),
		"file_size": len(binary),
		"functions": functions("bv"),
		"blocks": blocks("bv")
	}

	#bv.file.close()

	result = api.post("stats",data)
	if not result["ok"]:
		print "Failed to upload stats"
		return

def do_reference_poll(api, work):
	global work_dir, logger
	poll_id = work["poll"]
	bin_id = work["bsid"]
	poll_hash = work["hash"]

	print "Reference poll %d against binary %d" % (poll_id, bin_id)

	poll = api.download(poll_hash)
	bin_files = download_binary(api, bin_id)
	replay_prefix = os.path.join(work_dir, gen_replay_prefix("refpoll"))
	replays = get_replay_list(bin_files, replay_prefix, os.path.basename(poll))

	try:
		runner = qemu_cb_test.Runner(bin_files, [poll], None, None, False, False, False, 45, replay_prefix, True, True, None, logger)
		passed = runner.run() == 0
	except:
		print "Poll failed: %s" % sys.exc_info()[0]
		passed = False
	runner.cleanup()

	if passed:
		mem_pages, cpu_usage = get_perf_info(bin_files, replay_prefix, replays)
	replay_data = get_replay_data(replays)

	if not passed:
		print "Reference poll failed"
		return

	data = {"bsid": bin_id, "replays": replay_data, "mem": mem_pages, "cpu": cpu_usage}
	result = api.post("exec", data)
	if not result["ok"]:
		print "Failed to upload replay"
		return
	exec_id = result["execution"]

	data = {"poll": poll_id, "execution": exec_id}
	result = api.post("replay/refpoll", data)
	if not result["ok"]:
		print "Failed to upload poll results"
		return

def do_poll(api, work):
	global work_dir, logger
	poll_id = work["poll"]
	bin_id = work["bsid"]
	ids_id = work["idsid"]
	poll_hash = work["hash"]

	if ids_id is not None:
		print "Poll %d against binary %d with IDS %s" % (poll_id, bin_id, ids_id)
	else:
		print "Poll %d against binary %d" % (poll_id, bin_id)

	poll = api.download(poll_hash)
	bin_files = download_binary(api, bin_id)
	replay_prefix = os.path.join(work_dir, gen_replay_prefix("poll"))
	replays = get_replay_list(bin_files, replay_prefix, os.path.basename(poll))
	ids = None
	if ids_id is not None:
		ids = download_ids(api, ids_id)

	try:
		runner = qemu_cb_test.Runner(bin_files, [poll], None, None, False, False, False, 45, replay_prefix, True, True, ids, logger)
		passed = runner.run() == 0
	except:
		print "Poll failed: %s" % sys.exc_info()[0]
		passed = False
	runner.cleanup()

	mem_pages, cpu_usage = get_perf_info(bin_files, replay_prefix, replays)
	replay_data = get_replay_data(replays)

	data = {"bsid": bin_id, "replays": replay_data, "mem": mem_pages, "cpu": cpu_usage}
	result = api.post("exec", data)
	if not result["ok"]:
		print "Failed to upload replay"
		return
	exec_id = result["execution"]

	data = {"bsid": bin_id, "idsid": ids_id, "poll": poll_id, "pass": passed, "execution": exec_id}
	result = api.post("replay/poll", data)
	if not result["ok"]:
		print "Failed to upload poll results"
		return

def run_pov_and_report(api, pov_id, pov_hash, bin_id, ids_id):
	global work_dir, logger
	pov = api.download(pov_hash)

	header = open(pov, 'rb').read(4)
	if header == "\x7fCGC":
		pov = api.download(pov_hash, ".pov")
		pov_binary = True
	else:
		pov_binary = False

	bin_files = download_binary(api, bin_id)
	replay_prefix = os.path.join(work_dir, gen_replay_prefix("pov"))
	replays = get_replay_list(bin_files, replay_prefix, os.path.splitext(os.path.basename(pov))[0])
	ids = None
	if ids_id is not None:
		ids = download_ids(api, ids_id)

	seed = SHA384.new("cb_%d_%d" % (pov_id, bin_id)).hexdigest()
	pov_seed = SHA384.new("pov_%d_%d" % (pov_id, bin_id)).hexdigest()
	neg_seed = SHA384.new("negotiate_%d_%d" % (pov_id, bin_id)).hexdigest()

	os.chmod(pov, 0755)

	try:
		runner = qemu_cb_test.Runner(bin_files, [pov], None, None, True, True, False, 45, replay_prefix, True, True,
			ids, logger, seed = seed, pov_seed = pov_seed, negotiate_seed = neg_seed)
		passed = runner.run() == 0
	except:
		print "PoV failed: %s" % sys.exc_info()[0]
		passed = False
	runner.cleanup()

	if pov_binary:
		pov_type = get_pov_type_from_replay(replay_prefix, os.path.splitext(os.path.basename(pov))[0])
	else:
		# CQE-style PoVs are always type 1
		pov_type = 1

	mem_pages, cpu_usage = get_perf_info(bin_files, replay_prefix, replays)
	replay_data = get_replay_data(replays)

	exec_data = {"bsid": bin_id, "replays": replay_data, "mem": mem_pages, "cpu": cpu_usage}
	result = api.post("exec", exec_data)
	if not result["ok"]:
		print "Failed to upload replay"
		return
	exec_id = result["execution"]

	data = {}
	data["pov"] = pov_id
	data["bsid"] = bin_id
	data["idsid"] = ids_id
	data["pov_type"] = pov_type
	data["vulnerable"] = passed
	data["execution"] = exec_id
	result = api.post("replay/pov", data)
	if not result["ok"]:
		print "Failed to upload PoV results"
		return

def do_reference_pov(api, work):
	pov_id = work["pov"]
	bin_id = work["bsid"]
	pov_hash = work["hash"]

	print "PoV %d against reference binary %d" % (pov_id, bin_id)
	run_pov_and_report(api, pov_id, pov_hash, bin_id, None)

def do_pov(api, work):
	pov_id = work["pov"]
	bin_id = work["bsid"]
	ids_id = work["idsid"]
	pov_hash = work["hash"]

	if ids_id is not None:
		print "PoV %d against binary %d with IDS %s" % (pov_id, bin_id, ids_id)
	else:
		print "PoV %d against binary %d" % (pov_id, bin_id)
	run_pov_and_report(api, pov_id, pov_hash, bin_id, ids_id)

def do_patch_pov(api, work):
	pov_id = work["pov"]
	patch_id = work["patch"]
	bin_id = work["bsid"]
	pov_hash = work["hash"]

	print "PoV %d against reference patch %d (binary %d)" % (pov_id, patch_id, bin_id)
	run_pov_and_report(api, pov_id, pov_hash, bin_id, None)

def do_analysis(api, work):
	bin_id = work["bsid"]
	exec_id = work["execution"]
	config = work["config"]
	config_hash = SHA256.new(str(config)).hexdigest()

	print "Analysis of execution %d with config %s" % (exec_id, config)
	replay_prefix = os.path.join(work_dir, gen_replay_prefix("analysis"))
	bin_files = download_binary(api, bin_id)
	replays = download_replay(api, exec_id)
	replay_options = []
	for replay in replays:
		replay_options += ["-replay", replay]

	config_options = []
	for opt in config:
		config_options += ["-A", str(opt)]

	analysis_files = []
	for path in bin_files:
		filename = os.path.basename(path)
		outfile = replay_prefix + "-" + filename + ".analyze"
		analysis_files.append(outfile)

	subprocess.call(["./qemu-decree", "-t", "45"] + replay_options + ["-analyze", replay_prefix] + config_options + bin_files)

	data = get_replay_data(analysis_files, compressed=False)
	result = api.post("analyze/complete/%d" % exec_id, {"config": config, "data": data})
	if not result["ok"]:
		print "Failed to upload PoV results"
		api.post("analyze/fail/%d" % exec_id, {"config": config, "message": "Failed to upload PoV results"})
		return

if len(sys.argv) < 2:
	print "Expected API URL"
	exit(1)

# Parse options
wait = True
for opt in sys.argv[2:]:
	if opt == "nowait":
		wait = False
	else:
		print "Unknown option '" + opt + "'"
		exit(1)

work_dir = "./tempfiles"
if not os.path.exists(work_dir):
	try:
		os.makedirs(work_dir)
	except OSError as exception:
		if exception.errno != errno.EEXIST:
			raise


log_fh = sys.stderr
log_level = logging.ERROR
logger = logging.getLogger('cb-test')
log_stream = logging.StreamHandler(log_fh)
log_stream.setLevel(log_level)
log_stream.setFormatter(logging.Formatter('# %(message)s'))
logger.addHandler(log_stream)

api = trace_api.TraceAPI(sys.argv[1])

heartbeat = WorkerHeartbeatThread(api)
heartbeat.start()

while True:
	if wait:
		result = api.get("work/%s" % worker_id)
	else:
		result = api.get("work/%s/poll" % worker_id)
	if not result["ok"]:
		break

	work = result["work"]
	if work is None:
		if not wait:
			break
		continue

	try:
		if work["type"] == "refpoll":
			do_reference_poll(api, work)
		elif work["type"] == "poll":
			do_poll(api, work)
		elif work["type"] == "refpov":
			do_reference_pov(api, work)
		elif work["type"] == "pov":
			do_pov(api, work)
		elif work["type"] == "refpatch":
			do_patch_pov(api, work)
		elif work["type"] == "analyze":
			do_analysis(api, work)
		elif work["type"] == "stats":
			do_bin_stats(api, work)
		else:
			print "Unknown work type '%s'" % work["type"]
	except:
		traceback.print_exc()
