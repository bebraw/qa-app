declare module "*.css" {
  const content: string;
  export default content;
}

declare module "*.ttf" {
  const content: ArrayBuffer;
  export default content;
}

declare module "*.client.js" {
  const content: string;
  export default content;
}
