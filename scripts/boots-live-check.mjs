import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const out='artifacts/boots-research'; mkdirSync(out,{recursive:true});
const browser=await chromium.launch(); const page=await browser.newPage(); page.setDefaultTimeout(120000);
const api=[]; page.on('response',async response=>{if(response.url().endsWith('/api/classify'))api.push({status:response.status(),body:await response.json()});});
await page.goto('https://beatbox.grahammiles.me/');
await page.locator('input[type=file]').setInputFiles('artifacts/new-public-audio/freesound-740030.mp3');
await page.waitForFunction(()=>document.querySelector('.notice')?.textContent.includes('hits found'));
const rows=[];
for(const mode of ['hits','syllables']) {
 if(mode==='syllables') {await page.locator('#detection-mode').selectOption(mode); await page.waitForFunction(()=>!document.querySelector('button')?.disabled && document.querySelector('.notice')?.textContent.includes('Hits detected again'));}
 await page.getByRole('button',{name:'Classify with TypeSafe'}).click();
 await page.getByRole('status').filter({hasText:'TypeSafe pass complete'}).waitFor();
 const hits=await page.locator('.hit-row').allTextContents();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download MIDI'}).click();await(await download).saveAs(`${out}/real-boots-${mode}.mid`);
 rows.push({mode,hits});
}
writeFileSync(`${out}/real-boots-live.json`,JSON.stringify({source:'Freesound740030 CC0 development clip, unannotated; functional check only, no accuracy claim',rows,api},null,2));
console.log(JSON.stringify(rows));await browser.close();
