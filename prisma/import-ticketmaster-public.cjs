/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS scripts run directly with Node. */
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const prisma = new PrismaClient();
const schema = z.object({
 scannedAt: z.iso.datetime(),
 sources: z.array(z.object({ name: z.string(), complete: z.boolean() })),
 events: z.array(z.object({
  slug: z.string().regex(/^tm-[A-Za-z0-9_-]+$/), title: z.string().min(1), description: z.string(),
  category: z.enum(['CONCERT','THEATRE','ARTS','FAMILY','NIGHTLIFE','SPORTS']),
  venue: z.object({name:z.string().min(1),address:z.string(),city:z.string(),timezone:z.string().min(1)}),
  startsAt: z.iso.datetime(), imageUrl: z.url().nullable(), published: z.boolean(),
  externalUrl: z.url().refine(url => new URL(url).hostname === 'www.ticketmaster.com'),
  externalPriceMin: z.number().nonnegative().nullable(), externalPriceMax: z.number().nonnegative().nullable(),
  externalCurrency: z.string().regex(/^[A-Z]{3}$/).nullable(), externalPriceCheckedAt: z.iso.datetime(),
 }))
});
async function main() {
 const data = schema.parse(JSON.parse(fs.readFileSync(path.join(__dirname,'data','ticketmaster-public.json'),'utf8')));
 if (!data.events.length) throw new Error('The public snapshot contains no events. Nothing imported.');
 if (new Set(data.events.map(event=>event.slug)).size !== data.events.length) throw new Error('Duplicate event slugs in snapshot; nothing imported.');
 let imported = 0;
 const urls=data.events.map(e=>e.externalUrl);
 const existingRows=await prisma.event.findMany({where:{externalUrl:{in:urls}},select:{id:true,slug:true,externalUrl:true}});
 const existingByUrl=new Map(existingRows.map(event=>[event.externalUrl,event]));
 for (let offset=0; offset<data.events.length; offset+=10) {
  await Promise.all(data.events.slice(offset,offset+10).map(async row=>{
   const event={...row,startsAt:new Date(row.startsAt),externalPriceCheckedAt:new Date(row.externalPriceCheckedAt)};
   const existing=existingByUrl.get(event.externalUrl);
   if(existing) await prisma.event.update({where:{id:existing.id},data:{...event,slug:existing.slug}});
   else await prisma.event.upsert({where:{slug:event.slug},update:event,create:event});
   imported++;
  }));
  if(imported % 100 === 0) console.log(`Imported ${imported} events...`);
 }
 const verified=await prisma.event.count({where:{externalUrl:{in:urls},published:true}});
 console.log(`Imported ${imported} events from public pages; verified ${verified} published database records. ${data.events.filter(e=>e.externalPriceMin!==null).length} have public prices.`);
 const incomplete = data.sources.filter(s=>!s.complete);
 if(incomplete.length) console.log(`Incomplete public scans: ${incomplete.map(s=>s.name).join(', ')}`);
}
main().catch(error=>{console.error(error instanceof z.ZodError ? 'Public event snapshot failed validation.' : error.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
