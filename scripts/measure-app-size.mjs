import { readdir, lstat } from "node:fs/promises";
import { resolve,join } from "node:path";
const path=resolve(process.argv[2]??"");
if(!process.argv[2] || !path.endsWith(".app"))throw new Error("Pass a built .app directory.");
async function bytes(root){
 let total=0;
 for(const name of await readdir(root)){
  const file=join(root,name),info=await lstat(file);
  if(info.isSymbolicLink())continue;
  total+=info.isDirectory()?await bytes(file):info.size;
 }
 return total;
}
const frameworks={};
try{for(const name of await readdir(join(path,"Frameworks")))frameworks[name]=await bytes(join(path,"Frameworks",name));}catch(e){if(e.code!=="ENOENT")throw e;}
console.log(JSON.stringify({path,uncompressedBytes:await bytes(path),frameworks,note:"Built filesystem size, not App Store download size. Compare the same platform, architecture and configuration."},null,2));
