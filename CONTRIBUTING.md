# 🤝 EduChain Contribution Guide

> **EduChain** is a project that grows with the power of the open source community. We welcome your contributions! 🎉

## 📋 Table of Contents
- [Quick Start](#-quick-start)
- [Development Environment Setup](#-development-environment-setup)
- [Coding Style](#-coding-style)
- [Contribution Types](#-contribution-types)
- [Pull Request Guide](#-pull-request-guide)
- [License and Commercial Use](#-license-and-commercial-use)

---

## 🚀 Quick Start

### 1. Repository Setup
```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/educhain.git
cd educhain

# Add upstream repository
git remote add upstream https://github.com/educhain-platform/educhain.git

# Create development branch
git checkout -b feature/your-feature-name
```

### 2. Development Environment Setup
```bash
# Install dependencies
npm install
cd frontend && npm install && cd ..
cd ai-service && pip install -r requirements.txt && cd ..

# Set environment variables
cp backend/env.example backend/.env
cp frontend/env.example frontend/.env

# Run Docker containers
docker-compose up -d
```

### 3. Start Development
```bash
# Backend development server
cd backend && npm run dev

# Frontend development server (new terminal)
cd frontend && npm start

# AI service (new terminal)
cd ai-service && python main.py
```

---

## 🛠️ Development Environment Setup

### Prerequisites
- **Node.js**: 18.0+ ([Download](https://nodejs.org/))
- **Docker**: 24.0+ ([Download](https://docker.com/))
- **Git**: 2.30+ ([Download](https://git-scm.com/))
- **Python**: 3.9+ (for AI service)

### Recommended Tools
- **VS Code**: [EduChain Workspace Settings](.vscode/settings.json)
- **ESLint**: Code quality validation
- **Prettier**: Code formatting
- **Postman**: API testing

### Environment Variables Setup
```bash
# Backend (.env)
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/educhain
JWT_SECRET=your-secret-key

# Frontend (.env)
REACT_APP_API_URL=http://localhost:3000
REACT_APP_BLOCKCHAIN_NETWORK=polygon

# AI Service (.env)
MODEL_PATH=./models
REDIS_URL=redis://localhost:6379
```

---

## 💻 Coding Style

### JavaScript/TypeScript
```javascript
// ✅ Good example
const calculateScore = async (answers, userId) => {
  try {
    const evaluation = await aiService.evaluate(answers);
    const score = evaluation.confidence * 100;

    logger.info(`Score calculated for user ${userId}: ${score}`);
    return Math.round(score);
  } catch (error) {
    logger.error('Score calculation failed:', error);
    throw new Error('An error occurred during evaluation');
  }
};

// ❌ Bad example
const calc=function(a,u){try{let e=await aiService.evaluate(a);let s=e.confidence*100;console.log(`Score: ${s}`);return Math.round(s)}catch(e){throw new Error('error')}};
```

### Python (AI Service)
```python
# ✅ Good example
def analyze_feedback(text: str, context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyze feedback text.

    Args:
        text: Feedback text to analyze
        context: Additional context information

    Returns:
        Analysis result dictionary
    """
    try:
        sentiment = self.sentiment_analyzer.predict(text)
        keywords = self.keyword_extractor.extract(text)

        return {
            'sentiment': sentiment,
            'keywords': keywords,
            'confidence': self._calculate_confidence(sentiment, keywords)
        }
    except Exception as e:
        logger.error(f"Feedback analysis failed: {e}")
        raise AnalysisError("An error occurred during feedback analysis")

# ❌ Bad example
def analyze(t,c):return{'s':sentiment_analyzer.predict(t),'k':keyword_extractor.extract(t)}
```

### Commit Message Rules
```
✨ feat: Add new feature
🐛 fix: Bug fix
📚 docs: Documentation
🎨 style: Styling (code formatting)
🧪 test: Add/modify tests
🔧 refactor: Code refactoring
📦 chore: Build/configuration changes
🚀 perf: Performance improvement
```

---

## 🎯 Contribution Types

### 1. 🐛 Bug Fixes
- Bug reproduction and fixes
- Add regression tests
- Update related documentation

### 2. ✨ New Features
- Feature design and implementation
- Write unit tests
- API documentation
- Update user guides

### 3. 📚 Documentation
- README.md improvements
- API documentation writing
- Add code comments
- Create tutorials

### 4. 🧪 Testing Enhancement
- Write unit tests
- Add integration tests
- Implement E2E tests
- Performance testing

### 5. 🎨 UI/UX Improvements
- Interface design
- User experience optimization
- Accessibility improvement
- Responsive design

### 6. 🔧 Infrastructure Improvements
- CI/CD pipelines
- Docker optimization
- Security enhancement
- Performance optimization

---

## 📝 Pull Request Guide

### PR Creation Checklist
- [ ] Link related issues (`Closes #123`)
- [ ] Write and pass test code
- [ ] Follow coding style
- [ ] Update documentation
- [ ] Check for breaking changes

### PR Template Writing
1. **Title**: `[Feature] Brief description`
2. **Description**: Summary of changes
3. **Change Type**: Bug fix/feature addition, etc.
4. **Testing**: Test methods and results
5. **Screenshots**: For UI changes

### Code Review Process
1. **Automated Review**: CI/CD pipeline execution
2. **Peer Review**: Requires approval from at least 1 person
3. **QA Testing**: Quality verification
4. **Merge**: Auto/manual merge after approval

---

## ⚖️ License and Commercial Use

### ✅ Allowed Contributions
- **Open Source Improvements**: Free contributions welcome
- **Non-commercial Use**: For education/research purposes
- **Community Activities**: Bug bounties, hackathon participation

### ❌ Restricted Activities
- **Commercial Features**: License agreement required
- **Proprietary Code**: Cannot remain private
- **License Violations**: Subject to legal action

### 💰 Commercial License
For those wishing to use commercially:
- Email: mahzzangg@gmail.com
- Contact: [License Page](LICENSE)

---

## 🆘 Need Help?

### 📞 Contact
- **Technical Questions**: [GitHub Issues](https://github.com/educhain-platform/educhain/issues)
- **General Questions**: [Discord](https://discord.gg/educhain)
- **Email**: mahzzangg@gmail.com

### 📚 Additional Resources
- [API Documentation](https://docs.educhain.com)
- [Developer Guide](https://docs.educhain.com/dev)
- [Architecture Documentation](https://docs.educhain.com/architecture)

---

**Thank you for becoming a member of the EduChain community! 🌟**

*By contributing, your name will appear on the [contributors list](https://github.com/educhain-platform/educhain/graphs/contributors) and you can receive special NFT badges.*
