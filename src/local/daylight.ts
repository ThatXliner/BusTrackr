import * as T from 'three';

/** A locally painted daylight panorama, not a photograph of the surrounding hills. */
export function createDaylightBackdrop(){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
 const context=canvas.getContext('2d')!;
 const gradient=context.createLinearGradient(0,0,0,256);
 gradient.addColorStop(0,'#508fc4');
 gradient.addColorStop(.28,'#88b5d3');
 gradient.addColorStop(.46,'#c8dae0');
 gradient.addColorStop(.5,'#d9e1db');
 gradient.addColorStop(.56,'#b8c6bd');
 gradient.addColorStop(1,'#7f9991');
 context.fillStyle=gradient;context.fillRect(0,0,512,256);
 const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
 texture.mapping=T.EquirectangularReflectionMapping;
 return texture;
}
