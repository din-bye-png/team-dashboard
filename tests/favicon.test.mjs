import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';

function decodePng(buf){
  assert.equal(buf.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  let offset=8,width=0,height=0;const idat=[];
  while(offset<buf.length){
    const length=buf.readUInt32BE(offset);offset+=4;
    const type=buf.subarray(offset,offset+4).toString();offset+=4;
    const data=buf.subarray(offset,offset+length);offset+=length+4;
    if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);assert.equal(data[9],6);}
    else if(type==='IDAT')idat.push(data);
    else if(type==='IEND')break;
  }
  const raw=inflateSync(Buffer.concat(idat)),pixels=Buffer.alloc(width*height*4),stride=1+width*4;
  for(let y=0;y<height;y++){
    const row=raw.subarray(y*stride,(y+1)*stride);
    assert.equal(row[0],0);
    row.copy(pixels,y*width*4,1);
  }
  return {width,height,pixels};
}
function pixel(image,x,y){
  const i=(y*image.width+x)*4;
  return Array.from(image.pixels.subarray(i,i+4));
}

test('favicon is a plain #087dff circle, linked relatively for the Pages subpath',async()=>{
  const html=await readFile('public/index.html','utf8');
  assert.match(html,/img-src 'self'/);
  for(const link of ['href="favicon.svg"','href="favicon.png"','href="apple-touch-icon.png"'])assert.ok(html.includes(link),link);
  assert.doesNotMatch(html,/href="\/(?:favicon|apple-touch-icon)/);
  const svg=await readFile('public/favicon.svg','utf8');
  assert.match(svg,/fill="#087dff"/);
  assert.doesNotMatch(svg,/<(?:text|path|image|use)\b/);
  for(const [name,size] of [['public/favicon.png',32],['public/apple-touch-icon.png',180]]){
    const image=decodePng(await readFile(name));
    assert.equal(image.width,size);assert.equal(image.height,size);
    assert.deepEqual(pixel(image,Math.floor(size/2),Math.floor(size/2)),[8,125,255,255]);
    assert.deepEqual(pixel(image,0,0),[8,125,255,0]);
    assert.deepEqual(pixel(image,size-1,0),[8,125,255,0]);
  }
});
