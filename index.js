/* eslint-disable no-console */
const puppeteer = require('puppeteer');
const BibtexParser = require('bib2json');

const path = require('path');
const fs = require('fs').promises;

const outDir = 'out_json';
const inDir = 'in_bib';

// You can use a single file or an array of files as input

// Single file
const year = 8;
const name = `uist${year}`;
const files = [path.join(inDir, `${name}.bib`)];

// Array of files.
// This however might not work as the online server will block your IP
// if you exceed a number of requests
// const files = ['test1.bib', 'test2.bib']

scrap(files).then((res) => {
  const output = path.join(outDir, `${name}.json`);

  // if any array of one, print the object only
  let result = res; // the array of proceedings
  if (result.length === 1) result = result[0];

  fs.writeFile(output, JSON.stringify(result), (err) => {
    if (err) return console.log(err);
  });
});

// Helpers

function getFileName(filename) {
  const fname = filename.split('.').slice(0, -1)[0];
  return fname.split('/').pop();
}

async function parse(filename) {
  const text = await fs.readFile(path.join(filename), 'utf8');
  const data = BibtexParser(text);

  const papers = [];
  for (let i = 0; i < data.entries.length; i += 1) {
    const paperData = data.entries[i].Fields;
    const paper = await getPaperData(paperData.url);
    paper.url = paperData.url;
    paper.title = paperData.title;
    console.log(`Paper ${i} of ${data.entries.length} in ${filename} with url ${paper.url}`);
    papers.push(paper);
  }
  return papers;
}

function getPaperData(url) {
  return new Promise((resolve) => {
    // starting Puppeteer
    puppeteer.launch().then(async (browser) => {
      // opening a new page and navigating to Reddit
      const page = await browser.newPage();
      await page.goto(url, {
        waitUntil: 'load',
        // Remove the timeout
        timeout: 0,
      });
      await page.waitForSelector('body');

      // manipulating the page's contenit
      const dataPaper = await page.evaluate(() => {
        const author = document.body.querySelectorAll('.loa__author-name');
        const institution = document.body.querySelectorAll('.auth-institution');

        const result = { author: [], institution: [] };
        author.forEach((element) => {
          result.author.push(element.innerText);
        });
        institution.forEach((element) => {
          result.institution.push(element.innerText);
        });

        result.author = [...new Set(result.author)];
        return result;
      });

      dataPaper.country = toCountries([...new Set(dataPaper.institution)]);

      // closing the browser
      await browser.close();
      resolve(dataPaper);
    }).catch((err) => {
      console.error(err);
    });
  });
}

function toCountries(list) {
  const result = [];
  for (const el of list) {
    const country = el.split(',').slice(-1)[0].trim();
    result.push(country);
  }
  return [...new Set(result)];
}

function scrap(inputFiles) {
  return new Promise((resolve) => {
    const actions = inputFiles.map(parse);
    const results = Promise.all(actions); // pass array of promises

    results.then((data) => {
      const all = [];
      for (let i = 0; i < inputFiles.length; i += 1) {
        const proc = {};
        proc.proceedings = getFileName(inputFiles[i]);
        proc.papers = data[i];
        all.push(proc);
      }
      resolve(all);
    });
  });
}
