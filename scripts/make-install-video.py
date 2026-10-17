#!/usr/bin/env python3
"""Create the illustrated, narrated installation guide using Pillow, say and ffmpeg."""
from pathlib import Path
import subprocess, textwrap
from PIL import Image, ImageDraw, ImageFont

out = Path('build/sideloading'); out.mkdir(parents=True, exist_ok=True)
work = out / 'video'; work.mkdir(exist_ok=True)
regular = '/System/Library/Fonts/Supplemental/Arial.ttf'
bold = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
scenes = [
 ('RIVL, on your iPhone.', ['Native app. Free Apple signing.', 'A computer gets you started.', 'Refresh before seven days expire.'], 'Install RIVL without an App Store release. This illustrated guide uses SideStore and your own free Apple account. You need a computer for setup, and you must refresh the apps before seven days expire.'),
 ('Start with the essentials.', ['iPhone with iOS 16 or newer', 'Mac, Windows or Linux computer + USB', 'Wi-Fi and your own Apple account'], 'Have your iPhone, a USB cable, a computer, Wi-Fi, and your Apple account ready. If you already use RIVL, export your workouts first. Keep your existing app until you have verified the transfer.'),
 ('Get the official tools.', ['Open docs.sidestore.io', 'Follow Installation → Prerequisites', 'Get iLoader + LocalDevVPN'], 'Open the official SideStore documentation at docs dot sidestore dot io. Follow its current prerequisites to get iLoader for your computer and LocalDevVPN for your phone. The VPN helper may require an App Store download.'),
 ('Set up SideStore.', ['Connect the iPhone by USB and tap Trust', 'In iLoader: Install SideStore (Stable)', 'Complete Apple sign-in yourself'], 'Connect and unlock your iPhone. Trust the computer when asked. In iLoader, choose Install SideStore, Stable, and complete the Apple account steps yourself. Follow the official guide if any screen differs.'),
 ('Finish setup on iPhone.', ['Trust the developer app when prompted', 'Enable Developer Mode if required', 'Connect LocalDevVPN, then open SideStore'], 'On your phone, follow the official guide to trust the developer app and enable Developer Mode if required. Restart if prompted. Connect LocalDevVPN, then open SideStore and sign in with the same Apple account.'),
 ('Refresh SideStore first.', ['Stay connected to Wi-Fi', 'Keep LocalDevVPN connected', 'My Apps → refresh SideStore once'], 'While connected to Wi-Fi and LocalDevVPN, open My Apps in SideStore and refresh SideStore once. Complete this initial refresh before installing RIVL.'),
 ('Install RIVL.', ['Open the RIVL GitHub release', 'Save RIVL.ipa to Files on your iPhone', 'SideStore → My Apps → + → choose the IPA'], 'Open the GitHub release linked below this video and save RIVL dot IPA to Files on your iPhone. In SideStore, open My Apps, tap the plus button, and select that file. Let SideStore finish signing and installing it.'),
 ('Make room for your next ride.', ['Open RIVL and sign in', 'Choose the permissions you need', 'Check Health access and a short GPS recording'], 'Open RIVL and sign in. Choose the permissions you need. This download contains the iPhone app only. After re-signing, check Health access and a short GPS recording before relying on it for a workout. These capabilities still need validation on your signed installation.'),
 ('Keep it ready.', ['Refresh RIVL + SideStore before day 7', 'Use Wi-Fi + LocalDevVPN to refresh', 'Free accounts: 3 apps including SideStore'], 'Refresh both RIVL and SideStore before their seven day counters expire. Use Wi-Fi and LocalDevVPN. Background refresh can fail, so check the countdown. Free accounts allow three apps including SideStore. Pairing problems or iOS updates may require your computer again.'),
 ('Your next step: the guide.', ['github.com/OjayitTanwar/rivl', 'Open the installation guide or release', 'Illustrated walkthrough · screens may vary'], 'The release, written guide, and official SideStore links are at github dot com slash OjayitTanwar slash rivl. If installation fails, use the troubleshooting steps in the guide. Keep your current RIVL data backed up while changing installers.'),
]

segments=[]; subtitles=[]; elapsed=0
def stamp(seconds):
 ms=round(seconds*1000); h,ms=divmod(ms,3600000); m,ms=divmod(ms,60000); s,ms=divmod(ms,1000)
 return f'{h:02}:{m:02}:{s:02},{ms:03}'
for i,(title,lines,narration) in enumerate(scenes):
 image=Image.new('RGB',(1280,720),'#f7f5f0');d=ImageDraw.Draw(image)
 d.text((72,42),'RIVL',font=ImageFont.truetype(bold,32),fill='#df4b28')
 d.text((1010,49),f'INSTALL  {i+1:02}/{len(scenes)}',font=ImageFont.truetype(bold,18),fill='#555653')
 y=145
 for line in textwrap.wrap(title,31):
  d.text((72,y),line,font=ImageFont.truetype(bold,58),fill='#202722');y+=70
 y+=32
 for line in lines:
  d.ellipse((76,y+12,86,y+22),fill='#df4b28')
  d.text((104,y),line,font=ImageFont.truetype(regular,31),fill='#303b34');y+=64
 d.line((72,628,1208,628),fill='#d4d6cd',width=2)
 d.rectangle((72,628,72+int(1136*(i+1)/len(scenes)),632),fill='#df4b28')
 d.text((72,657),'Illustrated setup guide  •  Free signing needs renewal within 7 days',font=ImageFont.truetype(regular,21),fill='#555653')
 png=work/f'{i:02}.png';image.save(png)
 if i==0:image.save(out/'installation-thumbnail.png')
 audio=work/f'{i:02}.aiff'
 subprocess.run(['say','-v','Samantha','-r','163','-o',str(audio),narration],check=True)
 duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(audio)]))+1
 segment=work/f'{i:02}.mp4'
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-loop','1','-i',str(png),'-i',str(audio),'-t',str(duration),'-vf','fade=t=in:st=0:d=0.25,format=yuv420p','-af','apad=pad_dur=1','-c:v','libx264','-preset','ultrafast','-crf','23','-r','24','-c:a','aac','-b:a','128k','-movflags','+faststart',str(segment)],check=True)
 segments.append(segment.resolve())
 subtitles.append(f'{i+1}\n{stamp(elapsed)} --> {stamp(elapsed+duration-0.4)}\n'+ '\n'.join(textwrap.wrap(narration,85))+'\n')
 elapsed+=duration
 print(f'Scene {i+1}/{len(scenes)} ready',flush=True)
concat=work/'concat.txt';concat.write_text(''.join(f"file '{p}'\n"for p in segments))
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(concat),'-c','copy','-movflags','+faststart',str(out/'RIVL-installation.mp4')],check=True)
(out/'RIVL-installation.en.srt').write_text('\n'.join(subtitles))
(out/'RIVL-installation-transcript.txt').write_text('\n\n'.join(t+'\n'+n for t,_,n in scenes)+'\n')
print(f'Video ready: {elapsed:.1f} seconds',flush=True)
