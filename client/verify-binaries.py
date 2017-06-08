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
import Crypto.Random
import threading

binary_cache = {}

def hash(data):
	return SHA256.new(str(data)).hexdigest()

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

def do_poll(api, bin_id, poll_id, poll_hash):
	global work_dir, logger

	poll = api.download(poll_hash)
	bin_files = download_binary(api, bin_id)

	try:
		runner = qemu_cb_test.Runner(bin_files, [poll], None, None, False, False, False, 15, None, False, False, None, logger)
		passed = runner.run() == 0
	except:
		passed = False
	runner.cleanup()

	return passed

def do_pov(api, bin_id, pov_id, pov_hash):
	global work_dir, logger
	pov = api.download(pov_hash)

	header = open(pov, 'rb').read(4)
	if header == "\x7fCGC":
		pov = api.download(pov_hash, ".pov")
		pov_binary = True
	else:
		pov_binary = False

	bin_files = download_binary(api, bin_id)
	ids = None

	seed = SHA384.new("cb_%d_%d" % (pov_id, bin_id)).hexdigest()
	pov_seed = SHA384.new("pov_%d_%d" % (pov_id, bin_id)).hexdigest()
	neg_seed = SHA384.new("negotiate_%d_%d" % (pov_id, bin_id)).hexdigest()

	os.chmod(pov, 0755)

	try:
		runner = qemu_cb_test.Runner(bin_files, [pov], None, None, True, True, False, 15, None, False, False,
			None, logger, seed = seed, pov_seed = pov_seed, negotiate_seed = neg_seed)
		passed = runner.run() == 0
	except:
		passed = False
	runner.cleanup()

	return passed

if len(sys.argv) < 2:
	print "Expected API URL"
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
#logger.addHandler(log_stream)

api = trace_api.TraceAPI(sys.argv[1])

full_cs_list = api.get("cs")["list"]

cfe_bins = ["CROMU_00046", "CROMU_00047", "CROMU_00048", "CROMU_00051", "CROMU_00054", "CROMU_00055", "CROMU_00056",
	"CROMU_00057", "CROMU_00058", "CROMU_00059", "CROMU_00060", "CROMU_00061", "CROMU_00063", "CROMU_00064",
	"CROMU_00065", "CROMU_00066", "CROMU_00067", "CROMU_00072", "CROMU_00073", "CROMU_00074", "CROMU_00076",
	"CROMU_00077", "CROMU_00078", "CROMU_00079", "CROMU_00080", "CROMU_00081", "CROMU_00082", "CROMU_00083",
	"CROMU_00084", "CROMU_00085", "CROMU_00087", "CROMU_00088", "CROMU_00090", "CROMU_00092", "KPRCA_00062",
	"KPRCA_00063", "KPRCA_00064", "KPRCA_00065", "KPRCA_00068", "KPRCA_00069", "KPRCA_00071", "KPRCA_00073",
	"KPRCA_00074", "KPRCA_00075", "KPRCA_00077", "KPRCA_00079", "KPRCA_00081", "KPRCA_00086", "KPRCA_00087",
	"KPRCA_00088", "KPRCA_00090", "KPRCA_00091", "KPRCA_00092", "KPRCA_00093", "KPRCA_00094", "KPRCA_00096",
	"KPRCA_00097", "KPRCA_00099", "KPRCA_00100", "KPRCA_00101", "KPRCA_00102", "KPRCA_00105", "KPRCA_00106",
	"KPRCA_00108", "KPRCA_00110", "KPRCA_00111", "KPRCA_00112", "KPRCA_00118", "KPRCA_00119", "KPRCA_00120",
	"NRFIN_00043", "NRFIN_00044", "NRFIN_00045", "NRFIN_00046", "NRFIN_00047", "NRFIN_00048", "NRFIN_00049",
	"NRFIN_00051", "NRFIN_00052", "NRFIN_00053", "NRFIN_00054", "NRFIN_00055", "NRFIN_00056", "NRFIN_00057",
	"NRFIN_00059", "NRFIN_00060", "NRFIN_00061", "NRFIN_00063", "NRFIN_00064", "NRFIN_00065", "NRFIN_00066",
	"NRFIN_00067", "NRFIN_00068", "NRFIN_00069", "NRFIN_00070", "NRFIN_00071", "NRFIN_00072", "YAN01_00015",
	"YAN01_00016", "YAN01_00017", "CROMU_00093", "CROMU_00094", "CROMU_00095", "CROMU_00096", "CROMU_00097",
	"CROMU_00098"]

cs_list = []
for cs in full_cs_list:
	if cs["name"] in cfe_bins:
		cs_list.append(cs)

contents = ""

i = 0
for cs in cs_list:
	name = cs["name"]
	sys.stderr.write("[%d/%d] %d: %s" % (i + 1, len(cs_list), cs["csid"], name))
	sys.stderr.flush()

	i += 1

	polls = api.get("cs/%d/poll" % cs["csid"])["poll"][:2]
	povs = api.get("cs/%d/refpov" % cs["csid"])["pov"][:2]

	status = api.get("cs/%d/poll/ref/status" % cs["csid"])["status"]
	if len(status) == 0:
		sys.stderr.write(" <<NO POLLS>>\n")
		sys.stderr.flush()
		continue

	bsid = status[0]["bsid"]

	poll_failed = False
	pov_failed = False

	for poll in polls:
		sys.stderr.write(".")
		sys.stderr.flush()
		if not do_poll(api, bsid, poll["pollid"], poll["file"]):
			poll_failed = True

	for pov in povs:
		sys.stderr.write(".")
		sys.stderr.flush()
		if not do_pov(api, bsid, pov["povid"], pov["file"]):
			pov_failed = True

	if poll_failed:
		sys.stderr.write(" <<POLL FAILED>>")
		contents += 'echo "Invalid poll replay" >> %s/tags\n' % name
	if pov_failed:
		sys.stderr.write(" <<POV FAILED>>")
		contents += 'echo "Invalid PoV replay" >> %s/tags\n' % name
	if (not poll_failed) and (not pov_failed):
		sys.stderr.write(" OK")

	sys.stderr.write("\n")
	sys.stderr.flush()

sys.stderr.write("\n" + contents)
sys.stderr.flush()
