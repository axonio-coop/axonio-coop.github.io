# Axónio

Este documento contém informações úteis para auxiliar o desenvolvimento deste website.

## TLDR

- Cria páginas no `/src/pages`.
- Podes utilizar [CommentCommands](#commentcommands).
- Desenvolve com `npm run dev`.
- Faz build com `npm run build`.
- O build estará no `/docs`.

## Comandos npm

### `npm run build`

Utiliza este comando antes de fazeres commit. Este comando transforma SCSS em CSS, TS em JS, produz ficheiros HTML para o `/docs`.

### `npm run dev`

Abre um servidor de desenvolvimento que atualiza sempre que é detetada uma alteração. Caso cries novos ficheiros SCSS ou TypeScript, terás de executar este comando de novo. Denuncia qualquer bug que encontres no servidor de desenvolvimento.

## Estrutura de Ficheiros

### `/docs`

Esta pasta contém o resultado final do código HTML, CSS e JavaScript. **Não edites qualquer conteúdo nesta pasta**, pois qualquer alteração irá ser sobrescrita pelos scripts de build.

### `/public`

Todos os ficheiros dentro desta pasta iram ser copiados para o `/docs`, sem qualquer alteração.

### `/src/pages`

Ficheiros HTML com o conteúdo das páginas. É possível utilizar [CommentCommands](#commentcommands) no HTML.

As pastas funcionam como um sistema de rotas. Por exemplo: o ficheiro `/src/pages/abc/123.html` poderá ser acedido pelo URL `/abc/123/`.

### `/src/scss`

Ficheiros SCSS que irám ser transformado em CSS. Por exemplo: o ficheiro `/src/scss/exemplo.scss` será acessível em `/css/exemplo.css`.

### `/src/templates`

Ficheiros HTML para serem usados como [templates](#template-template). É possível utilizar [CommentCommands](#commentcommands) no HTML.

### `/src/ts`

Ficheiros TypeScript que irám ser transformado em JavaScript. Por exemplo: o ficheiro `/src/ts/exemplo.ts` será acessível em `/js/exemplo.js`.

### `index.ts`

Código responsável por fazer build do website.

### `webpack.mix.js`

Configuração para transformar TS em JS e SCSS em CSS.

## CommentCommands

O **CommentCommands** é um sistema desenvolvido para este projeto, onde comentários de HTML podem ser transformados em código HTML.

### `<!-- #TITLE: [title] -->`

Define o título da página que estará num `<title>`.

```html
<!-- #TITLE: Quem Somos? -->
<h1>Conhece a nossa equipa!</h1>
```

### `<!-- #TEMPLATE: [template] -->`

Código HTML do template `/src/templates/[template].html` irá substituir o comentário.

```html
<body>
    <!-- #TEMPLATE: header -->
    <p>Olá!</p>
    <!-- #TEMPLATE: footer -->
</body>
```

### `<!-- #EVAL: [javascript] -->`

A string do resultado do JavaScript indicado irá substituído pelo comentário. A execução do código é feita com segurança durante o build do website.

```html
&copy; Axónio <!-- #EVAL: new Date().getFullYear() -->
```