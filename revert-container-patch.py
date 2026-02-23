import re
import glob

# Revert the container.reset() patch - uncomment the container.reset() calls
files = glob.glob('tests/**/*.spec.ts', recursive=True)

for filepath in files:
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        if '// container.reset(); // Removed to preserve src/container.ts registrations' in content:
            new_content = content.replace(
                '// container.reset(); // Removed to preserve src/container.ts registrations',
                'container.reset();'
            )
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Reverted container.reset() in {filepath}")
    except Exception as e:
        print(f"Error processing {filepath}: {e}")

print("Revert complete.")
