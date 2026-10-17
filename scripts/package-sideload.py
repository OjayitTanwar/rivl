#!/usr/bin/env python3
"""Package a local Release app for recipient re-signing, never personal signing."""
import argparse, hashlib, json, os, pathlib, plistlib, shutil, subprocess, tempfile, zipfile
p=argparse.ArgumentParser();p.add_argument('app',type=pathlib.Path);p.add_argument('--output',default='build/sideloading');a=p.parse_args()
out=pathlib.Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
source=a.app.resolve();info=plistlib.load(open(source/'Info.plist','rb'))
if info.get('CFBundleIdentifier')!='app.rivl.training' or not(source/'main.jsbundle').is_file():raise SystemExit('Expected standalone RIVL Release app')
with tempfile.TemporaryDirectory(prefix='rivl-public-')as work:
 app=pathlib.Path(work)/'Payload'/'RIVL.app';app.parent.mkdir()
 subprocess.run(['ditto','--norsrc','--noextattr',str(source),str(app)],check=True)
 shutil.rmtree(app/'Watch',ignore_errors=True)
 for path in list(app.rglob('*')):
  if path.name in ['embedded.mobileprovision','SC_Info'] or path.suffix in ['.p12','.p8','.pem','.key']:
   if path.is_dir():shutil.rmtree(path)
   else:path.unlink()
  elif path.name=='_CodeSignature' and path.is_dir():shutil.rmtree(path)
 subprocess.run(['xattr','-cr',str(app)],check=True)
 # Preserve only requested capabilities, never personal identities or keychain prefixes.
 entitlements={'com.apple.developer.healthkit':True,'com.apple.developer.healthkit.background-delivery':True}
 ep=pathlib.Path(work)/'capabilities.plist';ep.write_bytes(plistlib.dumps(entitlements))
 magics={b'\xcf\xfa\xed\xfe',b'\xce\xfa\xed\xfe',b'\xfe\xed\xfa\xcf',b'\xca\xfe\xba\xbe',b'\xbe\xba\xfe\xca'}
 binaries=[]
 for path in app.rglob('*'):
  if path.is_file() and not path.is_symlink():
   with open(path,'rb')as f:magic=f.read(4)
   if magic in magics:binaries.append(path)
 for path in sorted(binaries,key=lambda x:len(x.parts),reverse=True):
  if path==app/info['CFBundleExecutable']:continue
  subprocess.run(['codesign','--force','--sign','-',str(path)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 subprocess.run(['codesign','--force','--sign','-','--entitlements',str(ep),str(app)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
 ipa=out/'RIVL.ipa'
 with zipfile.ZipFile(ipa,'w',zipfile.ZIP_DEFLATED,compresslevel=6)as z:
  for path in sorted(app.parent.rglob('*')):
   if path.is_file()or path.is_symlink():
    zi=zipfile.ZipInfo.from_file(path,arcname=str(path.relative_to(pathlib.Path(work))))
    if path.is_symlink():
     zi.create_system=3;zi.external_attr=(0o120777<<16);z.writestr(zi,os.readlink(path))
    else:
     zi.compress_type=zipfile.ZIP_DEFLATED;z.writestr(zi,path.read_bytes())
 with zipfile.ZipFile(ipa)as z:
  if z.testzip() or any(n.endswith('.mobileprovision')or'/Watch/'in n for n in z.namelist()):raise SystemExit('Archive validation failed')
 digest=hashlib.sha256(ipa.read_bytes()).hexdigest()
 (out/'SHA256SUMS.txt').write_text(f'{digest}  RIVL.ipa\n')
 metadata={'bundleIdentifier':info['CFBundleIdentifier'],'version':info['CFBundleShortVersionString'],'buildVersion':info['CFBundleVersion'],'minOSVersion':info['MinimumOSVersion'],'size':ipa.stat().st_size,'sha256':digest,'signing':'ad-hoc; recipient Apple signing required','watchIncluded':False,'entitlements':list(entitlements),'privacy':{k:v for k,v in info.items()if k.startswith('NS')and k.endswith('UsageDescription')}}
 (out/'release-metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
 print(json.dumps({'archive':str(ipa),'bytes':ipa.stat().st_size,'sha256':digest,'personalProfiles':0,'watchIncluded':False}))
