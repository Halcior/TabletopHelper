import { useEffect,useState } from 'react'
import { liveQuery } from 'dexie'
import type { Army,UnitDefinition } from '../../domain/army/types'
import { database } from '../../persistence/storage'
import { cloudPhoto, deleteCloudPhoto, uploadCloudPhoto } from './cloudMedia'
export type LocalVisualMedia={key:string;armyId:string;blob:Blob;updatedAt:string}
export function mediaKey(army:Army,unit?:UnitDefinition):string {return JSON.stringify([army.localMediaId??army.id,unit?'unit':'banner',unit?(unit.sourceMetadata?.nrSelectionId??unit.sourceId??unit.id):''])}
export function validatePhoto(file:File){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPEG, PNG or WebP photo.');if(file.size>12*1024*1024)throw new Error('Choose a photo smaller than 12 MB.')}
export async function savePhoto(army:Army,file:File,unit?:UnitDefinition){
 validatePhoto(file)
 let bitmap:ImageBitmap
 try{bitmap=await createImageBitmap(file)}catch{throw new Error('This image could not be decoded. Try another photo.')}
 try{
  if(bitmap.width*bitmap.height>40_000_000)throw new Error('Choose an image below 40 megapixels.')
  const max=unit?384:1600,ratio=Math.min(1,max/Math.max(bitmap.width,bitmap.height))
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio))
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Image processing is unavailable on this device.')
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height)
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Image compression failed.')),'image/webp',.8))
  if(blob.size>2*1024*1024)throw new Error('Compressed photo is too large. Choose a smaller image.')
  const key=mediaKey(army,unit)
  await database.visualMedia.put({key,armyId:army.id,blob,updatedAt:new Date().toISOString()})
  void uploadCloudPhoto(key,blob).catch(()=>undefined)
 }finally{bitmap.close()}
}
export async function removePhoto(army:Army,unit?:UnitDefinition){const key=mediaKey(army,unit);await database.visualMedia.delete(key);await deleteCloudPhoto(key)}
export function usePhoto(key:string|undefined){
 const [photo,setPhoto]=useState<{key:string;url:string}>()
 useEffect(()=>{
   if(!key)return
   let url:string|undefined,disposed=false,revision=0
   const update=(blob?:Blob)=>{
     if(disposed)return
     if(url) URL.revokeObjectURL(url)
     url=blob?URL.createObjectURL(blob):undefined
     setPhoto(url?{key,url}:undefined)
   }
   const subscription=liveQuery(()=>database.visualMedia.get(key)).subscribe({
     next:row=>{
       const version=++revision
       if(row){
         update(row.blob)
         void uploadCloudPhoto(key,row.blob,false).catch(()=>undefined)
       }else{
         update(undefined)
         void cloudPhoto(key).then(blob=>{
           if(blob&&version===revision&&!disposed)update(blob)
         }).catch(()=>undefined)
       }
     },
     error:()=>update(undefined),
   })
   return ()=>{disposed=true;subscription.unsubscribe();if(url)URL.revokeObjectURL(url)}
 },[key])
 return photo?.key===key?photo?.url:undefined
}
