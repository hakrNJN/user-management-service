import os
import re

files = open('failed-tests.txt', 'r', encoding='utf-8').read().splitlines()
files = list(set(f.strip() for f in files if f.strip()))

mocks = [
    'userProfileRepositoryMock', 'policyRepositoryMock', 'roleRepositoryMock', 
    'permissionRepositoryMock', 'assignmentRepositoryMock', 'userMgmtAdapterMock',
    'idpAdapterMock', 'userRepositoryMock', 'mockUserProfileRepository', 'mockPolicyRepository',
    'mockRoleRepository', 'mockPermissionRepository', 'mockAssignmentRepository', 'mockUserMgmtAdapter'
]

# We also want to match expect(mockUserAdminService.createUser).toHaveBeenCalledWith(expect.anything(), payload)
# But wait, UserAdminService expects (tenantId, payload). So 'expect.anything()' is fine.

# Just the repos and idp mock for now.
pattern = re.compile(r'expect\s*\(\s*(' + '|'.join(mocks) + r')\.(\w+)\s*\)\.toHaveBeenCalledWith\s*\(')

for f in files:
    filepath = f.replace('/', os.sep)
    if not os.path.exists(filepath):
        print(f"Skipping {filepath}, file not found.")
        continue
    try:
        with open(filepath, 'r', encoding='utf-8') as file:
            content = file.read()
            
        def replacer(match):
            # If it already has expect.any(String), avoid doubling it
            return match.group(0) + "expect.any(String), "
            
        new_content = pattern.sub(replacer, content)
        
        # Clean up cases where we added it to an already fixed one: expect.any(String), expect.any(String)
        new_content = new_content.replace('expect.any(String), expect.any(String)', 'expect.any(String)')
        
        # Clean up empty arg list: (expect.any(String), ) -> (expect.any(String))
        new_content = new_content.replace('expect.any(String), )', 'expect.any(String))')
        
        if content != new_content:
            with open(filepath, 'w', encoding='utf-8') as file:
                file.write(new_content)
            print(f"Fixed mock params in {filepath}")
    except Exception as e:
        print(f"Error processing {filepath}: {e}")

print("Python test patcher finished.")
