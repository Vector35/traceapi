#FROM nodesource/trusty:0.10
FROM nodesource/xenial:0.10

COPY . .

RUN npm install

RUN cd store && gunzip *.gz

EXPOSE 8000

CMD ["node","master.js"]
