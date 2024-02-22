import { stat, readdir, unlink, lstat, readFile, mkdir, writeFile, rmdir, cp } from 'fs/promises';
import { existsSync as exists } from 'fs';
import { join, sep, basename } from 'path';
import { minify } from 'html-minifier';
import escape from 'escape-html';
import { watch } from 'chokidar';
import express from 'express';
import { spawn } from 'child_process';
import { WebSocket, WebSocketServer } from 'ws';

const PORT = 8080;

const MAIN_TITLE = 'Axónio';
const TITLE_DIV = '·';

const PAGES_BASE = './src/pages';
const TEMPLATES_BASE = './src/templates';
const DOCS_BASE = './docs';
const PUBLIC_BASE = './public';

// ---------- RENDER ----------

// Finds all CommentCommand from an HTML string and replaces them with their result

async function render(html: string){

    const REGEX = /<!-- #[A-Z0-9_]+(: .*?)? -->/g;

    let promises: Promise<string>[] = [];

    html.replace(REGEX, str=>{
        promises.push(parse(str));
        return str;
    });

    let data = await Promise.all(promises);

    return html.replace(REGEX, str=>data.shift() ?? str);
}

// ---------- PARSE ----------

// Recognizes the command, runs it and returns its result

async function parse(comment: string){

    let matches = comment.match(/<!-- #([A-Z0-9_]+)(: (.*?))? -->/) ?? [];

    let cmd = matches[1];
    let args = matches[3];

    // Load HTML from template
    if(cmd == 'TEMPLATE'){
        let template = await readFile(join(TEMPLATES_BASE, `${args}.html`), 'utf-8');
        return await render(template);
    }

    if(cmd == 'EVAL'){
        return eval(args) ?? '';
    }

    return comment;
}

// ---------- BUILD ----------

// Takes care of turning pages into rendered HTML

let mainHtml = '';

async function build(path: string = ''){

    let pagePath = join(PAGES_BASE, path);

    // If the path is a directory,
    // it calls itself on the directory's items
    if((await stat(pagePath)).isDirectory()){

        for(let item of await readdir(pagePath))
            await build(join(path, item));

        return;
    }

    // Ignores any path that isn't an HTML file
    if(!path.endsWith('.html')) return;

    // THE PATH IS (probably) A PAGE!
    
    // Get the page content & title
    let content = await readFile(pagePath, 'utf-8');
    let title = (content.match(/<!-- #TITLE: (.*?) -->/) ?? [])[1];
    title = title ? `${title} ${TITLE_DIV} ${MAIN_TITLE}` : MAIN_TITLE;
    title = escape(title);
    // Add it to the main template
    let html = mainHtml
        .replace('<!-- #TITLE -->', `<title>${title}</title>`)
        .replace('<!-- #CONTENT -->', await render(content));

    // Understand where this page is suppose to be
    let parentDirs = path.split(sep);
    let name = parentDirs.pop()!;

    // Example: The page /src/pages/abc.html
    // should be saved in /docs/abc/index.html
    // so it has a clean URL 
    if(name !== 'index.html')
        parentDirs.push(name.replace(/\.html$/, ''));

    // Create necessary directories to make file
    await mkdir(join(DOCS_BASE, ...parentDirs), { recursive: true });

    // Write the HTML but minified
    await writeFile(
        join(DOCS_BASE, ...parentDirs, 'index.html'),
        minify(html,{
            collapseBooleanAttributes: true,
            collapseInlineTagWhitespace: true,
            collapseWhitespace: true,
            removeAttributeQuotes: true,
            removeComments: true
        })
    );

}

// ---------- RECURSIVE DELETE ----------

// Deleted everything inside a folder

const DELETE_EXCEPTIONS = ['css', 'js'];

async function recursiveDelete(path: string){

    for(let item of await readdir(path)){

        if(DELETE_EXCEPTIONS.includes(item)) continue;

        let itemPath = join(path, item);

        if((await lstat(itemPath)).isDirectory()){
            await recursiveDelete(itemPath);
            try{
                await rmdir(itemPath);
            }catch(e){}
        }else{
            try{
                await unlink(itemPath);
            }catch(e){}
        }

    }

}

// ---------- RUN ----------

async function run(){

    // Deleting old files
    await recursiveDelete(DOCS_BASE);

    // Updating the known main template
    mainHtml = await render(
        await readFile(
            join(TEMPLATES_BASE, 'main.html'),
            'utf-8'
        )
    );

    // Build pages
    await build();

    // Copy public folder
    await cp(PUBLIC_BASE, DOCS_BASE, { recursive: true });

}

// ---------- MAIN ----------

let argument = process.argv[2] ?? '';

if(argument === 'dev'){

    // --- STATIC SERVER ---

    const app = express();

    app.use(async (req, res, next)=>{

        let path = join(__dirname, DOCS_BASE, req.path);

        if(exists(path) && (await lstat(path)).isDirectory())
            path = join(path, 'index.html');
    
        if(
            !exists(path) ||
            !path.endsWith('.html')
        ) return next();

        let html = await readFile(path, 'utf-8');

        html += `<script>
const ws = new WebSocket(\`ws://\${location.hostname}:\${parseInt(location.port) + 1}\`);
ws.addEventListener('message', ()=>location.reload());
</script>`;

        res.send(html);

    });

    app.use(express.static(DOCS_BASE));
    
    app.listen(PORT, ()=>{

        const URL = `http://localhost:${PORT}/`;
        let command = '';

        if(process.platform == 'darwin')
            command = 'open';
        
        if(process.platform == 'win32')
            command = 'explorer.exe';
        
        if(process.platform == 'linux')
            command = 'xdg-open';
            
        if(!command){
            console.log(`Não foi possível abrir o browser na plataforma ${process.platform}! Por favor, denuncia este bug e abre este URL manualmente: ${URL}`);
            return;
        }

        spawn(command, [ URL ]);

    });

    // --- WEBSOCKET ---

    const wss = new WebSocketServer({ port: PORT + 1 });
    wss.on('connection', ws=>{
        (ws as any).isAlive = true;
        ws.on('pong', ()=>(ws as any).isAlive = true);
    });

    let aliveCheck = setInterval(()=>{
        for(let ws of wss.clients){

            if(!(ws as any).isAlive)
                return ws.terminate();

            (ws as any).isAlive = false;
            ws.ping();

        }
    }, 5e3);

    wss.on('close', ()=>clearInterval(aliveCheck));

    // --- FILE WATCHER ---

    let watcher = watch([ './public', './src' ], {
        ignored: [ p => p !== "." && /(^[.#]|(?:__|~)$)/.test(basename(p)) ],
        ignoreInitial: true
    });

    async function handleChange(){
        
        await run();

        for(let ws of wss.clients){
            if(ws.readyState === WebSocket.OPEN)
                ws.send('refresh');
        }

    }

    watcher
        .on('change', handleChange)
        .on('add', handleChange)
        .on('unlink', handleChange)
        .on('addDir', handleChange)
        .on('unlinkDir', handleChange);

}else run();