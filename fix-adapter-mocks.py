import re
import glob
import os

# This script removes the incorrectly prepended expect.any(String) from
# userMgmtAdapterMock assertions only. Repository mock assertions are correct
# and should NOT be touched.
#
# Pattern: userMgmtAdapterMock.xxx.toHaveBeenCalledWith(expect.any(String), ...)
#   => userMgmtAdapterMock.xxx.toHaveBeenCalledWith(...)

files_to_fix = glob.glob('tests/**/*.spec.ts', recursive=True) + glob.glob('tests/**/*.e2e.spec.ts', recursive=True)

# Match lines like: expect(userMgmtAdapterMock.xxx).toHaveBeenCalledWith(expect.any(String), ...)
# and remove the "expect.any(String), " part
pattern = re.compile(
    r'(expect\(userMgmtAdapterMock\.\w+\)\.toHaveBeenCalledWith\()expect\.any\(String\),\s*'
)

total_fixes = 0
for filepath in files_to_fix:
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        new_content, count = pattern.subn(r'\1', content)
        
        if count > 0:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Fixed {count} adapter mock assertions in {filepath}")
            total_fixes += count
    except Exception as e:
        print(f"Error processing {filepath}: {e}")

print(f"\nTotal adapter mock fixes: {total_fixes}")
