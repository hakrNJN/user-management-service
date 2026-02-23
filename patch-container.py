import os
import glob

# Find all spec files under tests
files = glob.glob('tests/**/*.spec.ts', recursive=True)

for file in files:
    try:
        with open(file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Replace container.reset(); with just container.clearInstances(); if clearInstances isn't there already,
        # otherwise just remove container.reset();
        if 'container.reset();' in content:
            new_content = content.replace('container.reset();', '// container.reset(); // Removed to preserve src/container.ts registrations')
            with open(file, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Patched container.reset() in {file}")
            
    except Exception as e:
        print(f"Error patching {file}: {e}")

print("Container patching complete.")
