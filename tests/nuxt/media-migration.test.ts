import { mount } from "@vue/test-utils";
import { computed, defineComponent, h, onBeforeUnmount, reactive, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import MedicineDashboard from "@/app/components/medicines/MedicineDashboard.vue";
import MedicineDetail from "@/app/components/medicines/MedicineDetail.vue";
import ImageUploader from "@/app/components/images/ImageUploader.vue";

const apiFetch=vi.fn();
const ElButton=defineComponent({props:{loading:Boolean,disabled:Boolean},setup(props,{slots,attrs}){return()=>h("button",{...attrs,disabled:props.disabled},slots.default?.());}});
const FileUpload=defineComponent({props:{accept:String,limitBytes:Number},emits:["select","error"],setup(props,{emit,slots,attrs}){return()=>h("button",{...attrs,class:"file-upload","data-accept":props.accept,"data-limit":props.limitBytes,onClick:()=>emit("select",new File(["x"],"photo.jpg",{type:"image/jpeg"}))},slots.default?.());}});
const pass=(tag="div")=>defineComponent({inheritAttrs:false,setup(_,{slots,attrs}){return()=>h(tag,attrs,Object.values(slots).flatMap(slot=>slot?.()||[]));}});
const global={stubs:{ElButton,FileUpload,ElCard:pass(),ElDialog:pass(),ElForm:pass("form"),ElFormItem:pass(),ElInput:pass("input"),ElSelect:pass("select"),ElOption:pass("option"),ElInputNumber:pass("input"),ElDatePicker:pass("input"),ElTag:pass("span"),ElEmpty:pass(),ElDivider:pass(),ElImage:pass("img"),NuxtLink:pass("a")}};
const medicine={id:"m1",name:"布洛芬",category:"感冒发烧",tags:null,quantityTotal:20,quantityRemaining:10,unit:"片",lowStockThreshold:2,locationText:"药箱",contentText:"饭后服",openedAt:null,expiresAt:"2027-01-01T00:00:00.000Z",expirationReminderDays:30,notes:null,status:"normal" as const};

beforeEach(()=>{apiFetch.mockReset();vi.stubGlobal("ref",ref);vi.stubGlobal("reactive",reactive);vi.stubGlobal("computed",computed);vi.stubGlobal("onBeforeUnmount",onBeforeUnmount);vi.stubGlobal("useApi",()=>({apiFetch}));vi.stubGlobal("ElMessage",{success:vi.fn(),error:vi.fn(),warning:vi.fn()});vi.stubGlobal("ElMessageBox",{confirm:vi.fn().mockResolvedValue(undefined)});vi.stubGlobal("URL",{createObjectURL:vi.fn(()=>"blob:preview"),revokeObjectURL:vi.fn()});});
afterEach(()=>vi.unstubAllGlobals());

describe("Vue medicine migration",()=>{
  it("updates and archives medicine through the actual API contract",async()=>{
    apiFetch.mockResolvedValueOnce({item:{...medicine,name:"新布洛芬"}}).mockResolvedValueOnce({success:true});
    const wrapper=mount(MedicineDashboard,{props:{initialItems:[medicine]},global});
    await wrapper.findAll("button").find(b=>b.text()==="编辑")!.trigger("click");
    await wrapper.findAll("button").find(b=>b.text()==="保存")!.trigger("click");
    expect(apiFetch).toHaveBeenNthCalledWith(1,"/api/medicines/m1",expect.objectContaining({method:"PUT",body:expect.objectContaining({name:"布洛芬",expiresAt:"2027-01-01"})}));
    await wrapper.findAll("button").find(b=>b.text()==="归档")!.trigger("click");
    expect(apiFetch).toHaveBeenNthCalledWith(2,"/api/medicines/m1",{method:"DELETE"});
  });
  it("uploads and deletes typed medicine attachments",async()=>{
    const attachment={id:"a1",originalName:"photo.jpg",mimetype:"image/jpeg",size:1,url:"https://x/photo.jpg",attachmentType:"medicine_photo" as const,sourceLabel:"药品照片",createdAt:"2026-01-01T00:00:00Z"};
    apiFetch.mockResolvedValueOnce({item:attachment}).mockResolvedValueOnce({success:true});
    const wrapper=mount(MedicineDetail,{props:{medicine,initialAttachments:[]},global});
    await wrapper.get(".file-upload").trigger("click");
    const body=(apiFetch.mock.calls[0][1] as {body:FormData}).body;
    expect(apiFetch.mock.calls[0][0]).toBe("/api/medicines/m1/attachments");expect(body.get("attachmentType")).toBe("medicine_photo");
    await wrapper.findAll("button").find(b=>b.attributes("aria-label")==="删除附件")!.trigger("click");
    expect(apiFetch).toHaveBeenLastCalledWith("/api/attachments/a1",{method:"DELETE"});
  });
});

describe("Vue image uploader migration",()=>{
  it("keeps the 100MB uploader contract and revokes local preview object URLs",async()=>{
    apiFetch.mockResolvedValueOnce({data:{id:"i1",filename:"x",originalName:"photo.jpg",mimetype:"image/jpeg",size:1,url:"https://x",createdAt:"2026-01-01"}});
    const wrapper=mount(ImageUploader,{global:{stubs:{FileUpload,ElAlert:pass(),ElButton}}});
    expect(wrapper.get(".file-upload").attributes("data-accept")).toBe("*/*");expect(wrapper.get(".file-upload").attributes("data-limit")).toBe(String(100*1024*1024));
    await wrapper.get(".file-upload").trigger("click");
    expect(apiFetch).toHaveBeenCalledWith("/api/images",expect.objectContaining({method:"POST"}));
    expect(URL.createObjectURL).toHaveBeenCalled();expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });
});

describe("Vue media page contracts",()=>{
  it("keeps auth/default metadata and voice MIME, filename, loading and accepted audio behavior",async()=>{
    for(const file of ["app/pages/images.vue","app/pages/voice.vue","app/pages/medicines/index.vue","app/pages/medicines/[id].vue"]){
      const source=await readFile(file,"utf8");expect(source).toContain('layout: "default"');expect(source).toContain('middleware: "auth"');
    }
    const voice=await readFile("app/pages/voice.vue","utf8");
    expect(voice).toContain('response.headers.get("content-type")');
    expect(voice).toContain('response.headers.get("content-disposition")');
    expect(voice).toContain("URL.revokeObjectURL");
    expect(voice).toContain(".mp3,.wav,.m4a,.flac,.aac,.ogg,.webm,.amr,.3gp");
    expect(voice).toContain(':loading="generating"');expect(voice).toContain(':loading="transcribing"');
  });
});
