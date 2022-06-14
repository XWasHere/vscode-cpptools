import * as vscode from 'vscode';
import { CancellationToken } from 'vscode-languageclient';
import { WorkspaceSymbolProvider } from '../Providers/workspaceSymbolProvider';

export class Token {
    begin: number = -1;
    len:   number = -1;
};

export class TNewLine extends Token {};
export class TDocOpen extends Token {};
export class TDocClose extends Token {};
export class TOptStar extends Token {};
export class TPEnd extends Token {};

export class TWhiteSpace extends Token {
    text: string = ""
};

export enum TCType {
    NORMAL, JAVADOC
};

export class TCommand extends Token {
    type: TCType = TCType.NORMAL;
    name: string = ""
};

export class TGenWord extends Token {
    text: string = "";
};

export class TFCLink extends Token {
    args: string[] = [];
    ns:   string[] = [];
    name: string   = "";
    raw:  string   = "";
}

type PNAny = Token | ParseNode;

export class ParseNode {
    owned: (ParseNode|Token)[] = [];
};

export class PNDocNode extends ParseNode {
    text:    (string|object)[] = [];
    content: PNAny[]           = []
};

export class PNDocument extends ParseNode {
    docs: PNDocNode[] = [];
}

export class File {
    name:    string  = "";
    content: string  = "";
    
    tokens:  Token[] = [];

    async reparse() {
        this.tokens = [];

        let src = this.content;
        let pos = 0;
        let end = src.length;

        let idoc = 0;
        let nl   = 1;

        let d = "";

        while (pos < end) {
            if (
                !idoc &&
                src[pos] == "/" && 
                src[pos + 1] == "*" && (
                    src[pos + 2] == "*" || src[pos + 2] == "!"
                )
            ) {
                let tok = new TDocOpen();
                tok.begin = pos;
                tok.len   = 3;
                this.tokens.push(tok);

                pos += 3;
                d += "{{DO}}"

                idoc = 1;
                nl = 0;
                continue;
            } else if (idoc && src[pos] == "*" && src[pos + 1] == "/") {
                let tok = new TDocClose();
                tok.begin = pos;
                tok.len   = 2;
                this.tokens.push(tok);

                pos += 2;
                d += "{{DC}}";

                idoc = 0;
                nl = 0;
                continue;
            } else if (idoc && src[pos] == "\n") {
                let tok = new TNewLine();
                tok.begin = pos;
                tok.len   = 1;
                this.tokens.push(tok);

                pos++;
                d += "\n{{NL}}";

                nl = 1;
                continue;
            } else if (idoc && nl && (
                   src[pos] == " " || src[pos] == "\t" || src[pos] == "*"
                )
            ) {
                let np = pos;
                let sc = 0;
                let siz = 0;

                while (
                    (sc == 0 && (src[np] == "*" && src[np + 1] != "/")) || 
                    src[np] == " " || 
                    src[np] == "\t"
                ) {
                    if (src[np] == "*") sc = 1;
                    np++;
                    siz++;
                }

                if (src[np] == "\n") {
                    np++;
                    siz++;

                    let tok = new TPEnd();
                    tok.begin = pos;
                    tok.len   = siz;
                    this.tokens.push(tok);

                    pos = np;
                    d += "{{PE}}\n";

                    nl = 1;
                    continue;
                }

                let tok = new TOptStar();
                tok.begin = pos;
                tok.len   = siz;
                this.tokens.push(tok);

                pos = np;
                d += "{{OS}}";

                nl = 0;
                continue;
            } else if (idoc && (src[pos] == " " || src[pos] == "\t")) {
                let np  = pos;
                let siz = 0;

                while (src[np] == " " || src[np] == "\t") {
                    siz++;
                    np++;
                }

                let tok = new TWhiteSpace();
                tok.begin = pos;
                tok.len   = siz;
                tok.text  = src.substring(pos, np);
                this.tokens.push(tok);

                pos = np;
                d += `{{WS "${tok.text}"}}`;

                nl = 0;
                continue;
            } else if (idoc && src[pos] == "\\" || src[pos] == "@") {
                let np  = pos + 1;
                let siz = 1;

                while (src[np] != " " && src[np] != "\t" && src[np] != "\n" && src[np] != "{" && src[np] != "[") {
                    siz++;
                    np++;
                }

                let tok = new TCommand();
                tok.begin = pos;
                tok.len   = siz;
                tok.type  = src[pos] == "\\" ? TCType.NORMAL : TCType.JAVADOC;
                tok.name  = src.substring(pos + 1, np);
                this.tokens.push(tok);

                pos = np;
                d += `{{CMD ${tok.type == TCType.JAVADOC ? "JAVA " : ""}"${tok.name}"}}`;

                nl = 0;
                continue;
            } else if (idoc) {
                let np  = pos;
                let siz = 0;

                let b_fn = 0;
                let e_fn = 0;
                let c_fn = 0;
                let a_fn = [];
                let s_fn = [];

                while (src[np] != " " && src[np] != "\n" && src[np] != "\t" && !(src[np] == "*" && src[np + 1] == "/")) {
                    if (src[np] == ":" && src[np + 1] == ":") {
                        if (siz) {
                            s_fn.push(src.substring(b_fn || pos, np))
                        }
                        np += 2;
                        b_fn = np;
                        c_fn = 1;
                        siz += 2;
                    } else if (src[np] == "(") {
                        c_fn = 1;
                        e_fn = np;
                        let pc = 1;
                        np++;
                        let ab = np;
                        let as = 0;

                        while (pc && src[np] != "\n") {
                            if (src[np] == "(") {
                                pc++;
                                np++;
                            } else if (src[np] == ")") {
                                pc--;
                                if (!pc && as) {
                                    a_fn.push(src.substring(ab, np));
                                }
                                np++;
                            } else if (src[np] == "," && pc == 1) {
                                a_fn.push(src.substring(ab, np))
                                np++;
                                as = 0
                                ab = np;
                            } else {
                                as++;
                                np++;
                            }
                        }
                    } else {
                        np++;
                        siz++;
                    }
                }

                b_fn ||= pos;
                e_fn ||= np;

                if (c_fn) {
                    let tok = new TFCLink();
                    tok.begin = pos;
                    tok.len = siz;
                    tok.name = src.substring(b_fn, e_fn);
                    tok.ns = s_fn;
                    tok.args = a_fn; 
                    tok.raw = src.substring(pos, np);
                    this.tokens.push(tok);

                    pos = np;
                    d += `{{FCL "${tok.ns.join("::")}" "${tok.name}" "${tok.args.join(",")}"}}`
                } else {
                    let tok = new TGenWord();
                    tok.begin = pos;
                    tok.len = siz;
                    tok.text = src.substring(pos, pos + siz);
                    this.tokens.push(tok);

                    pos = np;
                    d += `{{GW "${tok.text}"}}`;
                }

                nl = 0;
                continue;
            } else {
                d += src[pos++];
            }
        }

        //console.log(d);
        //console.log(this.tokens);
        let processing_queue: Promise<void>[] = [];

        let tokens = this.tokens;

        type pres<T> = { res: T | undefined, pos: number };

        // the jit will *probably* inline this.
        function die(pos: number) { return { res: undefined, pos }; }
        function accept<T>(res: T, pos: number) { return { res, pos }; }

        function parse_docnode(from: number): pres<PNDocNode> {
            let npos = from;
            let node = new PNDocNode();

            if (tokens[npos] instanceof TDocOpen) {
                node.owned.push(tokens[npos++]);

                let suc;
                while (tokens[npos] && !(suc = tokens[npos] instanceof TDocClose)) {
                    let tok: Token;
                    node.owned.push(tok = tokens[npos++]);
                    node.content.push(tok);
                    
                    if (tok instanceof TFCLink) {
                        let ns  = tok.ns.join("::");
                        let nm  = tok.name;
                        let idx = node.text.push({ targets: [] }) - 1;
                        processing_queue.push(InjectedServer.server.getWSSymbols(ns, nm, false).then(async (syms) => {
                            if (syms.length == 0) {
                                node.text[idx] = (tok as TFCLink).raw;
                            } else {
                                //@ts-ignore 
                                node.text[idx].targets = syms;
                            }
                            return;
                        }));
                    } else if (tok instanceof TWhiteSpace || tok instanceof TGenWord) {
                        let t = tok.text;
                        while ((tok = tokens[npos]) && (tok instanceof TWhiteSpace || tok instanceof TGenWord)) {
                            node.content.push(tok);
                            node.owned.push(tok);
                            t += tok.text;
                            npos++;
                        }
                        node.text.push(t);
                    } else if (tok instanceof TNewLine) { // newlines are part of the syntax here so these generic newlines need to be tested last
                        node.content.push(tok);
                        node.owned.push(tok);
                        node.text.push("\n");
                    }
                }

                if (!suc) return die(from);

                node.owned.push(tokens[npos++]);

                return accept(node, npos);
            }

            return die(from);
        }

        function parse_document(from: number): pres<PNDocument> {
            let docs = [];
            let npos = from;
            let node = new PNDocument();
            
            while (1) {
                let {res, pos} = parse_docnode(npos)
                
                if (res) {
                    docs.push(res);
                    node.owned.push(res);
                    npos = pos;
                } else break;
            }

            node.docs = docs;

            return { res: node, pos: npos };
        }
        
        let root = parse_document(0);

        await Promise.all(processing_queue);

        console.log(root);
    }
}

type SymbolInformation = {
    declaration: boolean;
} & vscode.SymbolInformation;

/**
 * i could mangle my code with the upstream code, but it would make
 * it really difficult if something changed a bunch, so instead ill
 * have this seperate thing that hooks into other parts of the extension
 */
export class InjectedServer {
    static server: InjectedServer;
    
    static activate(): void {
        InjectedServer.server = new InjectedServer();
    }

//#region oh no
    symcache: {
        [index: string]: {
            time: number;
            data: SymbolInformation[];
        };
    } = {};
    wsymp: WorkspaceSymbolProvider | undefined;
    
    cacheSymbols(ns: string, name: string, data: SymbolInformation[], time: number) {
        this.symcache[`${ns}##${name}`] = {
            time: Date.now() + time,
            data: data
        }
        console.log(this.symcache);
    }

    trySymbolCache(ns: string, name: string) {
        console.log(this.symcache);
        let ent = this.symcache[`${ns}##${name}`];
        if (ent) {
            if (ent.time < Date.now()) {
                this.killSymbols(ns, name);
                return undefined;
            } else return ent.data;
        } else return undefined;
    }

    killSymbols(ns: string, name: string) {
        if (this.symcache[`${ns}##${name}`]) {
            delete this.symcache[`${ns}##${name}`]
            console.log(`kill cache for ${ns}::${name}`);
        }
    }

    async getWSSymbols(ns: string, name: string, includedcls: boolean = true, nocache: boolean = false) : Promise<SymbolInformation[]> {
        if (!nocache) {
            let c = this.trySymbolCache(ns, name);
            if (c) return c;
        }

        let syms = (await this.wsymp?.provideWorkspaceSymbols(`${ns}::${name}`, CancellationToken.None) ?? []).filter((sym) => {
            //@ts-ignore
            let nsym : SymbolInformation = sym;
            if (sym.containerName != (ns == "" ? undefined : ns)) return;
            if ((/[^(<]*/.exec(sym.name)??[""])[0] != name) return;
            //@ts-ignore
            ({1:nsym.name,2:nsym.declaration}=/^(.*?)( \(declaration\))?$/.exec(sym.name)??[sym.name,sym.name,undefined]);
            //@ts-ignore
            nsym.declaration = nsym.declaration != undefined;
            if (includedcls ? 0 : nsym.declaration) return;
            return nsym;
        }) as SymbolInformation[];

        if (!nocache) this.cacheSymbols(ns, name, syms, 10000);

        return syms;
    }
//#endregion
//#region file bookkeeping
    files : {[index: string]: File} = {};

    maybeAddDocument(document: vscode.TextDocument) {
        if (this.files[document.fileName] == undefined) {
            let f = new File();
            f.name    = document.fileName;
            f.content = document.getText();
            this.files[document.fileName] = f;
            return f;
        } else return this.files[document.fileName];
    }
//#endregion
//#region hooks
    onDidChangeTextDocument(ev: vscode.TextDocumentChangeEvent) {
        let file = this.maybeAddDocument(ev.document);

        // this will be used to reparse from a token when thats implemented.
        // TODO(@xwashere): do that
        let reparse_point = file.content.length - 1;

        for (let i = 0; i < ev.contentChanges.length; i++) {
            let change = ev.contentChanges[i];
            file.content = file.content.substring(0, change.rangeOffset) + change.text + file.content.substring(change.rangeOffset + change.rangeLength);
            reparse_point = change.rangeOffset < reparse_point ? change.rangeOffset : reparse_point;
        }

        file.reparse();

        // console.log(file.content)
        // console.log(file.content.substring(reparse_point));
    }
//#endregion
}