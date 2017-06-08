import json, requests, base64, os
from Crypto.Hash import SHA256

class TraceAPI:
	def __init__(self, url, cache = "./cache"):
		self.url = url.rstrip("/")
		self.cache = cache
		if not os.path.exists(self.cache):
			os.mkdir(self.cache)

	def download(self, hashname, ext = ""):
		if os.path.exists(os.path.join(self.cache, hashname + ext)):
			return os.path.join(self.cache, hashname + ext)
		data = requests.get(self.url + "/data/" + hashname).content
		if SHA256.new(data).hexdigest() != hashname:
			raise RuntimeError, "Download of " + hashname + " corrupt"
		out = open(os.path.join(self.cache, hashname + ext), "wb")
		out.write(data)
		out.close()
		return os.path.join(self.cache, hashname + ext)

	def get(self, api):
		try:
			r = requests.get(self.url + "/" + api)
			return r.json()
		except:
			return {'ok': False}

	def post(self, api, data):
		try:
			r = requests.post(self.url + "/" + api, json=data)
			return r.json()
		except:
			return {'ok': False}

	def team_id(self, name):
		result = self.get("team")
		if not result["ok"]:
			return None

		for t in result["teams"]:
			if t["name"] == name:
				return t["id"]
		return None

	def cs_id(self, name):
		result = self.get("cs")
		if not result["ok"]:
			return None

		for cs in result["list"]:
			if cs["name"] == name:
				return cs["csid"]
		return None

