import * as vscode from 'vscode';

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

}

export class File {
    name:    string  = "";
    content: string  = "";
    
    tokens:  Token[] = [];

    reparse() {
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

        console.log(d);
        console.log(this.tokens);
    }
}

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