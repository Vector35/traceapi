#!/usr/bin/env python
import trace_api
import sys
import base64
import json
import shutil

if len(sys.argv) < 4:
	print "Expected API URL, execution ID, and analysis list"
	exit(1)

api = trace_api.TraceAPI(sys.argv[1])

config = sys.argv[3:]

result = api.post("analyze/request/%d" % int(sys.argv[2]), {"config": config})
if not result["ok"]:
	print json.dumps(result)
	exit(1)

for i in xrange(0, len(result["result"])):
	path = api.download(result["result"][i])
	shutil.copy(path, "analysis%d" % i)
	print "analysis%d - %s" % (i, result["result"][i])

