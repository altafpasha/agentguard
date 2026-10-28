from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="codesec-agentguard",
    version="1.0.0",
    description="Official Python SDK for the AgentGuard AI Agent Security Gateway",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="CodeSec AI / AgentGuard Security Team",
    author_email="security@agentguard.dev",
    url="https://github.com/altafpasha/agentguard",
    license="MIT",
    packages=find_packages(exclude=["tests*"]),
    python_requires=">=3.9",
    include_package_data=True,
    package_data={"agentguard": ["py.typed"]},
)

