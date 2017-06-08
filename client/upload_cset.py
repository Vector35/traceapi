#!/usr/bin/env python
import trace_api
import sys
import base64
import json
import md5

def upload_cset(url, cs_name, bin_paths, loc, cwe, shortname, description, readme, tags):
	api = trace_api.TraceAPI(url)

	binaries = []
	for path in bin_paths:
		data = open(path, 'rb').read()
		binaries.append(base64.b64encode(data))

	result = api.post("binset", {"binaries": binaries})
	if not result["ok"]:
		print json.dumps(result)
		return None
	binary = result["bsid"]

	name_hash = md5.md5(cs_name).hexdigest()

	result = api.post("cs", {"name": cs_name, "name_hash": name_hash, "bsid": binary, "loc": loc, "cwe": cwe, "shortname": shortname, "description": description, "readme": readme, "tags": tags})
	if not result["ok"]:
		print json.dumps(result)
		return None

	return {"ok": True, "bsid": binary, "csid": result["csid"]}

def get_cset_id(url, name):
	api = trace_api.TraceAPI(url)
	return api.cs_id(cs_name)

if __name__ == "__main__":
	if len(sys.argv) < 4:
		print "Expected API URL, CS name, and binary list"
		exit(1)

	result = upload_cset(sys.argv[1], sys.argv[2], sys.argv[3:])
	if result is None:
		exit(1)
	print json.dumps(result)
