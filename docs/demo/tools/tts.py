import asyncio, json, edge_tts, sys
t=json.load(open('docs/demo/narration-ar.json',encoding='utf-8'))
async def main():
    for i,x in enumerate(t):
        await edge_tts.Communicate(x,'ar-EG-SalmaNeural',rate='-2%').save('docs/demo/assets/audio/ar-%02d.mp3'%i)
        print(i,end=' ',flush=True)
asyncio.run(main())
