import { stat, readdir, unlink, lstat, readFile, mkdir, writeFile, rmdir, cp } from 'fs/promises';
import { join, sep } from 'path';
import { minify } from 'html-minifier';
import escape from 'escape-html';

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

if(argument === 'loop'){

    (async ()=>{
        
        while(true){

            await run();

            await (new Promise(r=>setTimeout(r, 5 * 1e3)))

        }

    })();

}else run();