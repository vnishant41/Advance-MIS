import os, re

js_files = [
    r'app\static\js\admin.js',
    r'app\static\js\analytics.js',
    r'app\static\js\api.js',
    r'app\static\js\app.js',
    r'app\static\js\auth.js',
    r'app\static\js\chat.js',
    r'app\static\js\crishi.js',
    r'app\static\js\dashboard.js',
    r'app\static\js\data-update.js',
    r'app\static\js\kanban.js',
    r'app\static\js\mis.js',
    r'app\static\js\report.js',
    r'app\static\js\roster.js',
    r'app\static\js\tasks.js'
]

def check_js_syntax(filepath):
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    bracket_stack = []
    mode_stack = ['code']
    
    in_single_quote = False
    in_double_quote = False
    in_line_comment = False
    in_block_comment = False
    in_regex = False
    escape = False

    i = 0
    line_no = 1
    col_no = 0
    n = len(content)
    errors = []
    last_sig_token = None

    while i < n:
        char = content[i]
        col_no += 1

        if char == '\n':
            line_no += 1
            col_no = 0
            if in_line_comment:
                in_line_comment = False
            i += 1
            continue

        if in_line_comment:
            i += 1
            continue

        if in_block_comment:
            if char == '*' and i + 1 < n and content[i+1] == '/':
                in_block_comment = False
                i += 2
                col_no += 1
                continue
            i += 1
            continue

        if in_single_quote:
            if escape:
                escape = False
            elif char == '\\':
                escape = True
            elif char == '\'':
                in_single_quote = False
                last_sig_token = 'string'
            i += 1
            continue

        if in_double_quote:
            if escape:
                escape = False
            elif char == '\\':
                escape = True
            elif char == '\"':
                in_double_quote = False
                last_sig_token = 'string'
            i += 1
            continue

        if in_regex:
            if escape:
                escape = False
            elif char == '\\':
                escape = True
            elif char == '/':
                in_regex = False
                # consume flags
                while i + 1 < n and content[i+1].isalpha():
                    i += 1
                    col_no += 1
                last_sig_token = 'regex'
            i += 1
            continue

        current_mode = mode_stack[-1]

        if current_mode == 'template':
            if escape:
                escape = False
                i += 1
                continue
            elif char == '\\':
                escape = True
                i += 1
                continue
            elif char == '`':
                mode_stack.pop()
                last_sig_token = 'template'
                i += 1
                continue
            elif char == '$' and i + 1 < n and content[i+1] == '{':
                mode_stack.append('code')
                bracket_stack.append(('}', line_no, col_no, '${'))
                last_sig_token = '${'
                i += 2
                col_no += 1
                continue
            else:
                i += 1
                continue

        # In 'code' mode
        if char == '/' and i + 1 < n and content[i+1] == '/':
            in_line_comment = True
            i += 2
            col_no += 1
            continue
        if char == '/' and i + 1 < n and content[i+1] == '*':
            in_block_comment = True
            i += 2
            col_no += 1
            continue

        # Check regex vs division
        if char == '/':
            # If last token was an operator, keyword, punctuation, or beginning: regex
            # If last token was identifier, number, ), ], it is division
            regex_starters = {'(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', 'return', 'case', 'yield', '${', None}
            if last_sig_token in regex_starters:
                in_regex = True
                i += 1
                continue
            else:
                last_sig_token = '/'
                i += 1
                continue

        if char.isspace():
            i += 1
            continue

        if char == '\'':
            in_single_quote = True
            i += 1
            continue
        if char == '\"':
            in_double_quote = True
            i += 1
            continue
        if char == '`':
            mode_stack.append('template')
            i += 1
            continue

        if char in '({[':
            expected = ')' if char == '(' else ('}' if char == '{' else ']')
            bracket_stack.append((expected, line_no, col_no, char))
            last_sig_token = char
        elif char in ')}]':
            if not bracket_stack:
                errors.append(f'Unmatched closing {char} at line {line_no}:{col_no}')
            else:
                expected, exp_line, exp_col, orig = bracket_stack.pop()
                if char != expected:
                    errors.append(f'Mismatched closing {char} at line {line_no}:{col_no}, expected {expected} opened at line {exp_line}:{exp_col} ({orig})')
                if orig == '${':
                    if mode_stack and mode_stack[-1] == 'code':
                        mode_stack.pop()
            last_sig_token = char
        elif char.isalnum() or char in '_$':
            # read word
            start_j = i
            while i < n and (content[i].isalnum() or content[i] in '_$'):
                i += 1
                col_no += 1
            word = content[start_j:i]
            last_sig_token = word
            continue
        else:
            last_sig_token = char

        i += 1

    if in_block_comment:
        errors.append('Unclosed block comment /* ... */ at EOF')
    if len(mode_stack) > 1 and mode_stack[-1] == 'template':
        errors.append('Unclosed template literal ` at EOF')
    if in_single_quote:
        errors.append('Unclosed single quote \' at EOF')
    if in_double_quote:
        errors.append('Unclosed double quote \" at EOF')
    if in_regex:
        errors.append('Unclosed regex / at EOF')
    while bracket_stack:
        expected, l, c, orig = bracket_stack.pop()
        errors.append(f'Unclosed {orig} from line {l}:{c}')

    return errors

total_issues = 0
for jf in js_files:
    errs = check_js_syntax(jf)
    if errs:
        print(f'{jf}: {len(errs)} syntax issues:')
        for e in errs[:10]:
            print(f'   {e}')
        total_issues += len(errs)
    else:
        print(f'{jf}: PASS')

print(f'\nTotal JS files: {len(js_files)}, total issues: {total_issues}')
