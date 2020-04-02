//基类
class MyVue {
    constructor(options){
        this.$el = options.el;
        this.$data = options.data;
        let computed = options.computed;
        let methods = options.methods;
        //如果el存在，进行编译
        if(this.$el) {
            //把数据全部转化成Object.defineProperty来定义
            new Observer(this.$data);
            
            for(let key in computed) {
                Object.defineProperty(this.$data,key,{
                   get:()=> {
                       return computed[key].call(this);
                   } 
                });
            }
            for(let key in methods){
                Object.defineProperty(this,key,{
                    get:()=>{
                        return methods[key];
                    }
                });
            }
            this.proxyVm(this.$data);
            new Compiler(this.$el,this);
        }
    }
    proxyVm(data){ //代理 目的 vm.xx => vm.$data.xx 可以直接从实例上取值
        for(let key in data){
            Object.defineProperty(this,key,{
                get(){
                    return data[key];
                },
                set(newValue){
                    data[key] = newValue;
                }
            })
        }
    }
}
//发布订阅类
class Dep{
    constructor(){
        this.subs = []; //存放所有的watcher
    }
    //订阅
    addSub(watcher){
        this.subs.push(watcher);
    }
    //发布
    notify(){
        this.subs.forEach(watcher => watcher.update());
    }
}
//观察者
class Watcher{
    constructor(vm,expr,cb){
        this.vm = vm;
        this.expr = expr;
        this.cb = cb;
        //默认存放一个老值，当变化时才调用回调函数
        this.oldValue = this.get();
    }
    get(){
        Dep.target = this; 
        let value = CompilerUtil.getVal(this.vm,this.expr);
        Dep.target = null; //依赖收集完成置空
        return value;
    }
    update(){//数据变化后调用此跟新方法
        let newValue = CompilerUtil.getVal(this.vm,this.expr);
        if(this.oldValue != newValue){
            this.cb(newValue);
        }
    }
}
//观察类
class Observer {
    constructor(data){
        this.observer(data);
    }
    observer(data){
        if(data && typeof data === 'object'){//data存在并且是一个对象
            for(let key in data) {
                this.defindeReactive(data,key,data[key]);
            }
        }
    }
    defindeReactive(obj,key,value){//数据劫持
        this.observer(value);
        let dep = new Dep(); //给每个属性添加发布订阅功能
        Object.defineProperty(obj,key,{
            get(){
                Dep.target && dep.addSub(Dep.target);
                return value;
            },
            set:(newValue) => {
                if(newValue != value){
                    this.observer(newValue);
                    value = newValue;
                    dep.notify();
                }
            }
        });
    }
}
//编译类
class Compiler{
    constructor(el,vm){
        //判断el是一个元素还是字符串
        this.el = this.isElementNode(el) ? el : document.querySelector(el);
        this.vm = vm;
        //将节点存入内存
        let fragment = this.node2Fragment(this.el);
        //编译模板 用数据
        this.compiler(fragment);
        //将内存中的dom渲染到页面  把内容塞回页面
        this.el.appendChild(fragment);
    }
    //是否是指令
    isDirective(attrName){
        //是否以v-开头
        return attrName.startsWith('v-');
    }
    //编译元素节点 
    compilerElement(node){
        let attrs = node.attributes;
        [...attrs].forEach(attr => {
            let {name,value:expr} = attr;
            //判断是否含有指令
            if(this.isDirective(name)){
                let [,directive] = name.split('-');
                let [directiveName,eventName] = directive.split(':');
                CompilerUtil[directiveName](node,expr,this.vm,eventName);
            }
        })
    }
    //编译文本节点  
    compilerText(node){
        let content = node.textContent;
        if(/\{\{(.+?)\}\}/.test(content)){
            CompilerUtil['text'](node,content,this.vm);
        }
    }
    compiler(node){//编译内存中的dom节点
        let childNodes = node.childNodes;
        [...childNodes].forEach(child => {
            if(this.isElementNode(child)){ //元素节点调用元素编译
                this.compilerElement(child);
                //递归遍历子节点
                this.compiler(child);
            } else {//文本节点调用文本编译
                this.compilerText(child);
            }
        })
    }
    isElementNode(node){
        return node.nodeType === 1;
    }
    node2Fragment(node){
        //创建一个文档碎片
        let fragment = document.createDocumentFragment();
        let firstChild;
        while(firstChild = node.firstChild){
            fragment.appendChild(firstChild);
        }
        return fragment;
    }
}

CompilerUtil = {
    getVal(vm,expr){
        return expr.split('.').reduce((data,current) => {
            return data[current];
        },vm.$data)
    },
    setVal(vm,expr,value){
        expr.split('.').reduce((data,current,index,arr) => {
            if(index == arr.length-1){
                data[current] = value;
            }
            return data[current];
        },vm.$data);
    },
    on(node,expr,vm,eventName){
        node.addEventListener(eventName,()=>{
            vm[expr].call(vm,e);
        })
    },
    //解析v-model指令
    model(node,expr,vm){ //node节点 expr表达式 vm当前实例
        let fn = this.updater['modelUpdater'];
        //添加观察 依赖收集
        new Watcher(vm,expr,(newValue)=>{
            fn(node,newValue); //如果数据发生变化，更新
        });
        node.addEventListener('input', e=> { //视图发生变化触发数据更改
            let value = e.target.value;
            this.setVal(vm,expr,value);
        });
        let value = this.getVal(vm,expr); 
        fn(node,value);
    },
    html(node,expr,vm){
        let fn = this.updater['htmlUpdater'];
        //添加观察 依赖收集
        new Watcher(vm,expr,(newValue)=>{
            fn(node,newValue); //如果数据发生变化，更新
        });
        let value = this.getVal(vm,expr); 
        fn(node,value);
    },
    getContentValue(vm,expr){
        return expr.replace(/\{\{(.+?)\}\}/g,(...args)=>{
            return this.getVal(vm,args[1]);
        })
    },
    text(node,expr,vm){
        let fn = this.updater['textUpdater'];
        let content = expr.replace(/\{\{(.+?)\}\}/g,(...args) => {
            new Watcher(vm,args[1],() => {
                fn(node,this.getContentValue(vm,expr));
            })
           return  this.getVal(vm,args[1]);
        });
        fn(node,content);
    },
    updater:{
        modelUpdater(node,val){
            node.value = val;
        },
        htmlUpdater(node,val){
            node.innerHTML = val;
        },
        textUpdater(node,val) {
            node.textContent = val;
        }
    }
}
